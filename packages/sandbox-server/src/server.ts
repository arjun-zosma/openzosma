import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, normalize, relative, resolve } from "node:path"
import { createLogger } from "@openzosma/logger"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { SandboxAgentManager } from "./agent.js"
import type { CreateSessionRequest, KBFileEntry, SendMessageRequest } from "./types.js"

const log = createLogger({ component: "sandbox-server" })

/**
 * Create the Hono HTTP server that runs inside each sandbox container.
 *
 * This is the primary interface between the orchestrator and the sandboxed
 * pi-coding-agent. The orchestrator communicates with this server via HTTP,
 * routing messages in and streaming events (SSE) out.
 */
const WORKSPACE_DIR = process.env.OPENZOSMA_WORKSPACE ?? "/workspace"
const KB_DIR = join(WORKSPACE_DIR, ".knowledge-base")

/**
 * Resolve a relative path within the KB directory.
 * Returns null if the resolved path escapes the KB root (path traversal).
 */
const resolveKBPath = (relativePath: string): string | null => {
	const resolved = resolve(KB_DIR, normalize(relativePath))
	if (!resolved.startsWith(KB_DIR)) return null
	return resolved
}

/**
 * Recursively collect all files in a directory.
 * Returns entries with relative paths and file contents.
 */
const collectKBFiles = (dir: string, base: string = dir): KBFileEntry[] => {
	if (!existsSync(dir)) return []

	const entries: KBFileEntry[] = []
	for (const dirent of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, dirent.name)
		if (dirent.isDirectory()) {
			entries.push(...collectKBFiles(fullPath, base))
		} else if (dirent.isFile()) {
			const relPath = relative(base, fullPath)
			try {
				const content = readFileSync(fullPath, "utf-8")
				const stat = statSync(fullPath)
				entries.push({
					path: relPath,
					content,
					sizeBytes: stat.size,
					modifiedAt: stat.mtime.toISOString(),
				})
			} catch {
				// Skip files that can't be read (e.g. broken symlinks)
			}
		}
	}
	return entries
}

export function createSandboxApp(): Hono {
	const app = new Hono()
	const agent = new SandboxAgentManager()

	// -----------------------------------------------------------------------
	// Health check
	// -----------------------------------------------------------------------

	app.get("/health", (c) => {
		return c.json({
			status: "ok",
			sessions: agent.listSessions().length,
			uptime: process.uptime(),
		})
	})

	// -----------------------------------------------------------------------
	// Session management
	// -----------------------------------------------------------------------

	/**
	 * POST /sessions -- create a new agent session inside this sandbox.
	 */
	app.post("/sessions", async (c) => {
		const body = await c.req.json<CreateSessionRequest>().catch(() => ({}) as CreateSessionRequest)

		try {
			const sessionId = agent.createSession({
				sessionId: body.sessionId,
				provider: body.provider,
				model: body.model,
				systemPrompt: body.systemPrompt,
				toolsEnabled: body.toolsEnabled,
			})

			return c.json({ sessionId }, 201)
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Unknown error creating session"
			const stack = err instanceof Error ? err.stack : undefined
			log.error("POST /sessions failed", { error: message, stack })
			return c.json({ error: message }, 500)
		}
	})

	/**
	 * GET /sessions/:id -- check if a session exists.
	 */
	app.get("/sessions/:id", (c) => {
		const sessionId = c.req.param("id")
		if (!agent.hasSession(sessionId)) {
			return c.json({ error: "Session not found" }, 404)
		}
		return c.json({ sessionId, status: "active" })
	})

	/**
	 * DELETE /sessions/:id -- end and remove a session.
	 */
	app.delete("/sessions/:id", (c) => {
		const sessionId = c.req.param("id")
		const deleted = agent.deleteSession(sessionId)
		if (!deleted) {
			return c.json({ error: "Session not found" }, 404)
		}
		return c.json({ ok: true })
	})

	/**
	 * GET /sessions -- list all sessions in this sandbox.
	 */
	app.get("/sessions", (c) => {
		return c.json({ sessions: agent.listSessions() })
	})

	// -----------------------------------------------------------------------
	// Message handling (SSE streaming)
	// -----------------------------------------------------------------------

	/**
	 * POST /sessions/:id/messages -- send a user message and stream agent events.
	 *
	 * Returns an SSE stream. Each event is a JSON-encoded AgentStreamEvent.
	 * The stream ends when the agent finishes its turn.
	 */
	app.post("/sessions/:id/messages", (c) => {
		const sessionId = c.req.param("id")

		if (!agent.hasSession(sessionId)) {
			return c.json({ error: "Session not found" }, 404)
		}

		return streamSSE(c, async (stream) => {
			const abort = new AbortController()
			stream.onAbort(() => abort.abort())

			let body: SendMessageRequest
			try {
				body = await c.req.json<SendMessageRequest>()
			} catch {
				await stream.writeSSE({ event: "error", data: JSON.stringify({ error: "Invalid request body" }) })
				return
			}

			if (!body.content) {
				await stream.writeSSE({ event: "error", data: JSON.stringify({ error: "content is required" }) })
				return
			}

			try {
				for await (const event of agent.sendMessage(sessionId, body.content, abort.signal)) {
					await stream.writeSSE({
						event: event.type,
						data: JSON.stringify(event),
					})
				}
			} catch (err: unknown) {
				if (!abort.signal.aborted) {
					const message = err instanceof Error ? err.message : "Unknown error"
					await stream.writeSSE({
						event: "error",
						data: JSON.stringify({ type: "error", error: message }),
					})
				}
			}
		})
	})

	/**
	 * POST /sessions/:id/cancel -- cancel the current turn.
	 *
	 * This is a placeholder. The actual cancellation happens when the client
	 * disconnects from the SSE stream (abort signal fires).
	 */
	app.post("/sessions/:id/cancel", (c) => {
		const sessionId = c.req.param("id")
		if (!agent.hasSession(sessionId)) {
			return c.json({ error: "Session not found" }, 404)
		}
		// Cancellation is handled by the SSE abort signal in sendMessage.
		// A dedicated cancel mechanism would require tracking active generators,
		// which will be added if needed.
		return c.json({ ok: true })
	})

	// -----------------------------------------------------------------------
	// Knowledge base CRUD
	// -----------------------------------------------------------------------

	/**
	 * GET /kb -- list all KB files with content.
	 *
	 * Returns all files under /workspace/.knowledge-base/ recursively,
	 * including their content (for pull sync back to the dashboard).
	 */
	app.get("/kb", (c) => {
		const files = collectKBFiles(KB_DIR)
		return c.json({ files })
	})

	/**
	 * PUT /kb/* -- create or update a KB file.
	 *
	 * The path after /kb/ is the relative file path within the KB directory.
	 * Body: { content: string }
	 */
	app.put("/kb/*", async (c) => {
		const filePath = c.req.path.replace(/^\/kb\//, "")
		if (!filePath) {
			return c.json({ error: "File path is required" }, 400)
		}

		const resolved = resolveKBPath(filePath)
		if (!resolved) {
			return c.json({ error: "Invalid path (traversal detected)" }, 400)
		}

		let body: { content: string }
		try {
			body = await c.req.json<{ content: string }>()
		} catch {
			return c.json({ error: "Invalid request body" }, 400)
		}

		if (typeof body.content !== "string") {
			return c.json({ error: "content must be a string" }, 400)
		}

		// Ensure parent directories exist
		const parentDir = resolve(resolved, "..")
		mkdirSync(parentDir, { recursive: true })

		writeFileSync(resolved, body.content, "utf-8")
		return c.json({ ok: true, path: filePath })
	})

	/**
	 * DELETE /kb/* -- delete a KB file or directory.
	 *
	 * The path after /kb/ is the relative file path within the KB directory.
	 */
	app.delete("/kb/*", (c) => {
		const filePath = c.req.path.replace(/^\/kb\//, "")
		if (!filePath) {
			return c.json({ error: "File path is required" }, 400)
		}

		const resolved = resolveKBPath(filePath)
		if (!resolved) {
			return c.json({ error: "Invalid path (traversal detected)" }, 400)
		}

		if (!existsSync(resolved)) {
			return c.json({ error: "File not found" }, 404)
		}

		rmSync(resolved, { recursive: true, force: true })
		return c.json({ ok: true, path: filePath })
	})

	return app
}
