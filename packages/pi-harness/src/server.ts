import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { createLogger } from "@openzosma/logger"
import type { HarnessConfig } from "./config.js"
import { HarnessSessionManager } from "./session-manager.js"
import type { CreateSessionRequest, SendMessageRequest } from "./types.js"

const log = createLogger({ component: "pi-harness-server" })

/**
 * Create the Hono HTTP server for the pi-harness standalone agent.
 *
 * Exposes a minimal REST + SSE API for creating sessions and streaming
 * agent events. Designed to be wrapped by a gateway or consumed directly
 * by clients (dashboard, CLI, mobile apps).
 */
export function createHarnessApp(config: HarnessConfig): Hono {
	const app = new Hono()
	const sessions = new HarnessSessionManager(config)

	// -----------------------------------------------------------------------
	// Optional API key middleware
	// -----------------------------------------------------------------------
	if (config.apiKey) {
		app.use("/*", async (c, next) => {
			// Skip auth for health check
			if (c.req.path === "/health") return next()

			const provided = c.req.header("x-api-key")
			if (provided !== config.apiKey) {
				return c.json({ error: "Unauthorized" }, 401)
			}
			return next()
		})
	}

	// -----------------------------------------------------------------------
	// Health check
	// -----------------------------------------------------------------------
	app.get("/health", (c) => {
		return c.json({
			status: "ok",
			sessions: sessions.getSessionCount(),
			uptime: process.uptime(),
			version: process.env.npm_package_version ?? "0.1.0",
		})
	})

	// -----------------------------------------------------------------------
	// Session management
	// -----------------------------------------------------------------------

	/**
	 * POST /sessions -- create a new agent session.
	 */
	app.post("/sessions", async (c) => {
		const body = await c.req.json<CreateSessionRequest>().catch(() => ({}) as CreateSessionRequest)

		log.info("POST /sessions", {
			hasSystemPromptPrefix: !!body.systemPromptPrefix,
			systemPromptPrefixLength: body.systemPromptPrefix?.length ?? 0,
		})

		try {
			const sessionId = sessions.createSession({
				sessionId: body.sessionId,
				provider: body.provider,
				model: body.model,
				systemPrompt: body.systemPrompt,
				systemPromptPrefix: body.systemPromptPrefix,
				systemPromptSuffix: body.systemPromptSuffix,
				toolsEnabled: body.toolsEnabled,
				workspaceDir: body.workspaceDir,
			})

			return c.json({ sessionId }, 201)
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Unknown error creating session"
			log.error("POST /sessions failed", { error: message })
			return c.json({ error: message }, 500)
		}
	})

	/**
	 * GET /sessions/:id -- get session metadata.
	 */
	app.get("/sessions/:id", (c) => {
		const sessionId = c.req.param("id")
		const session = sessions.getSession(sessionId)
		if (!session) {
			return c.json({ error: "Session not found" }, 404)
		}
		return c.json({
			sessionId: session.sessionId,
			status: "active",
			createdAt: session.createdAt,
			workspaceDir: session.workspaceDir,
		})
	})

	/**
	 * DELETE /sessions/:id -- end and remove a session.
	 */
	app.delete("/sessions/:id", (c) => {
		const sessionId = c.req.param("id")
		const deleted = sessions.deleteSession(sessionId)
		if (!deleted) {
			return c.json({ error: "Session not found" }, 404)
		}
		return c.json({ ok: true })
	})

	/**
	 * GET /sessions -- list all active sessions.
	 */
	app.get("/sessions", (c) => {
		const ids = sessions.listSessions()
		return c.json({ sessions: ids })
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

		if (!sessions.hasSession(sessionId)) {
			return c.json({ error: "Session not found" }, 404)
		}

		return streamSSE(c, async (stream) => {
			const abort = new AbortController()
			stream.onAbort(() => {
				log.info("SSE stream aborted by client", { sessionId })
				abort.abort()
			})

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

			log.info("Sending message", { sessionId, contentLength: body.content.length })
			const msgStartTime = Date.now()
			let eventCount = 0

			try {
				for await (const event of sessions.sendMessage(sessionId, body.content, abort.signal)) {
					eventCount++
					await stream.writeSSE({
						event: event.type,
						data: JSON.stringify(event),
					})
				}
				log.info("Stream completed", { sessionId, eventCount, durationMs: Date.now() - msgStartTime })
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : "Unknown error"
				log.error("Stream error", { sessionId, error: message, eventCount })
				if (!abort.signal.aborted) {
					await stream.writeSSE({
						event: "error",
						data: JSON.stringify({ type: "error", error: message }),
					})
				}
			}
		})
	})

	// -----------------------------------------------------------------------
	// Steering and control
	// -----------------------------------------------------------------------

	/**
	 * POST /sessions/:id/steer -- deliver a steering message mid-turn.
	 */
	app.post("/sessions/:id/steer", async (c) => {
		const sessionId = c.req.param("id")
		if (!sessions.hasSession(sessionId)) {
			return c.json({ error: "Session not found" }, 404)
		}
		let body: { content: string }
		try {
			body = await c.req.json<{ content: string }>()
		} catch {
			return c.json({ error: "Invalid request body" }, 400)
		}
		if (!body.content) {
			return c.json({ error: "content is required" }, 400)
		}
		await sessions.steer(sessionId, body.content)
		return c.json({ ok: true })
	})

	/**
	 * POST /sessions/:id/followup -- queue a follow-up for after the turn.
	 */
	app.post("/sessions/:id/followup", async (c) => {
		const sessionId = c.req.param("id")
		if (!sessions.hasSession(sessionId)) {
			return c.json({ error: "Session not found" }, 404)
		}
		let body: { content: string }
		try {
			body = await c.req.json<{ content: string }>()
		} catch {
			return c.json({ error: "Invalid request body" }, 400)
		}
		if (!body.content) {
			return c.json({ error: "content is required" }, 400)
		}
		await sessions.followUp(sessionId, body.content)
		return c.json({ ok: true })
	})

	/**
	 * POST /sessions/:id/cancel -- cancel the active turn.
	 */
	app.post("/sessions/:id/cancel", (c) => {
		const sessionId = c.req.param("id")
		if (!sessions.hasSession(sessionId)) {
			return c.json({ error: "Session not found" }, 404)
		}
		sessions.cancelSession(sessionId)
		return c.json({ ok: true })
	})

	return app
}
