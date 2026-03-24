import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { SandboxAgentManager } from "./agent.js"
import type { CreateSessionRequest, SendMessageRequest } from "./types.js"

/**
 * Create the Hono HTTP server that runs inside each sandbox container.
 *
 * This is the primary interface between the orchestrator and the sandboxed
 * pi-coding-agent. The orchestrator communicates with this server via HTTP,
 * routing messages in and streaming events (SSE) out.
 */
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
			console.error("[sandbox-server] POST /sessions failed:", message, stack ?? "")
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

	return app
}
