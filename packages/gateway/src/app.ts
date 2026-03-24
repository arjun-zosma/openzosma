import { createHash, randomBytes } from "node:crypto"
import { buildDefaultAgentCard } from "@openzosma/a2a"
import type { Pool } from "@openzosma/db"
import { agentConfigQueries, apiKeyQueries } from "@openzosma/db"
import type { Context } from "hono"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import { createPerAgentRouter } from "./a2a.js"
import type { SessionManager } from "./session-manager.js"

/**
 * Extract userId from request. Currently reads from X-User-Id header.
 * Will be replaced by Better Auth session middleware when wired in.
 */
function getUserId(c: Context): string | undefined {
	return c.req.header("X-User-Id") ?? undefined
}

export function createApp(sessionManager: SessionManager, pool?: Pool): Hono {
	const app = new Hono()

	app.use(
		"*",
		cors({
			origin: ["http://localhost:3000"],
			allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization", "X-User-Id"],
		}),
	)

	app.get("/health", (c) => c.json({ status: "ok" }))

	// A2A default Agent Card — returns the first agent config's card
	app.get("/.well-known/agent.json", async (c) => {
		if (pool) {
			const card = await buildDefaultAgentCard(pool)
			if (card) return c.json(card)
		}
		return c.json({
			name: "OpenZosma Agent",
			description: "Self-hosted AI agent platform",
			url: `${process.env.PUBLIC_URL ?? "http://localhost:4000"}/a2a/agents`,
			version: "1.0.0",
			capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
			skills: [],
			authentication: { schemes: ["bearer"] },
		})
	})

	// A2A per-agent routes
	if (pool) {
		app.route("/a2a", createPerAgentRouter(sessionManager, pool))
	}

	// -----------------------------------------------------------------------
	// Session routes
	// -----------------------------------------------------------------------

	app.post("/api/v1/sessions", async (c) => {
		const userId = getUserId(c)
		const session = await sessionManager.createSession(undefined, undefined, undefined, userId)
		return c.json({ id: session.id, createdAt: session.createdAt }, 201)
	})

	app.get("/api/v1/sessions/:id", (c) => {
		const session = sessionManager.getSession(c.req.param("id"))
		if (!session) {
			return c.json({ error: "Session not found" }, 404)
		}
		return c.json({
			id: session.id,
			createdAt: session.createdAt,
			messageCount: session.messages.length,
		})
	})

	app.delete("/api/v1/sessions/:id", (c) => {
		const deleted = sessionManager.deleteSession(c.req.param("id"))
		if (!deleted) {
			return c.json({ error: "Session not found" }, 404)
		}
		return c.json({ ok: true })
	})

	app.post("/api/v1/sessions/:id/messages", async (c) => {
		const session = sessionManager.getSession(c.req.param("id"))
		if (!session) {
			return c.json({ error: "Session not found" }, 404)
		}

		const body = await c.req.json<{ content: string }>()
		if (!body.content) {
			return c.json({ error: "content is required" }, 400)
		}

		const userId = getUserId(c)
		const events = []
		for await (const event of sessionManager.sendMessage(c.req.param("id"), body.content, undefined, userId)) {
			events.push(event)
		}

		const text = events
			.filter((e) => e.type === "message_update" && e.text)
			.map((e) => e.text)
			.join("")

		return c.json({ role: "assistant", content: text })
	})

	app.get("/api/v1/sessions/:id/messages", (c) => {
		const session = sessionManager.getSession(c.req.param("id"))
		if (!session) {
			return c.json({ error: "Session not found" }, 404)
		}
		return c.json(session.messages)
	})

	// SSE stream — subscribe to real-time events for a session.
	// Will switch to Valkey pub/sub when the orchestrator is in place.
	app.get("/api/v1/sessions/:id/stream", (c) => {
		const session = sessionManager.getSession(c.req.param("id"))
		if (!session) {
			return c.json({ error: "Session not found" }, 404)
		}

		return streamSSE(c, async (stream) => {
			const abort = new AbortController()
			stream.onAbort(() => abort.abort())

			for await (const event of sessionManager.subscribe(c.req.param("id"), abort.signal)) {
				await stream.writeSSE({ data: JSON.stringify(event) })
			}
		})
	})

	// -----------------------------------------------------------------------
	// Agent config routes (require DB pool)
	// -----------------------------------------------------------------------

	if (pool) {
		app.get("/api/v1/agents", async (c) => {
			const agents = await agentConfigQueries.listAgentConfigs(pool)
			return c.json({
				agents: agents.map((a) => ({
					id: a.id,
					name: a.name,
					description: a.description,
					model: a.model,
					provider: a.provider,
					skills: a.skills,
					createdAt: a.createdAt,
				})),
			})
		})

		app.get("/api/v1/agents/:id", async (c) => {
			const agent = await agentConfigQueries.getAgentConfig(pool, c.req.param("id"))
			if (!agent) {
				return c.json({ error: "Agent config not found" }, 404)
			}
			return c.json(agent)
		})
	}

	// -----------------------------------------------------------------------
	// API key routes (require DB pool)
	// -----------------------------------------------------------------------

	if (pool) {
		app.post("/api/v1/api-keys", async (c) => {
			const body = await c.req.json<{ name: string; scopes?: string[]; expiresAt?: string }>()
			if (!body.name) {
				return c.json({ error: "name is required" }, 400)
			}

			const rawKey = `ozk_${randomBytes(32).toString("base64url")}`
			const keyPrefix = rawKey.slice(0, 12)
			const keyHash = createHash("sha256").update(rawKey).digest("hex")
			const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined

			const apiKey = await apiKeyQueries.createApiKey(pool, body.name, keyHash, keyPrefix, body.scopes, expiresAt)
			return c.json({ id: apiKey.id, key: rawKey }, 201)
		})

		app.get("/api/v1/api-keys", async (c) => {
			const keys = await apiKeyQueries.listApiKeys(pool)
			return c.json({
				keys: keys.map((k) => ({
					id: k.id,
					name: k.name,
					keyPrefix: k.keyPrefix,
					scopes: k.scopes,
					lastUsedAt: k.lastUsedAt,
					expiresAt: k.expiresAt,
					createdAt: k.createdAt,
				})),
			})
		})

		app.delete("/api/v1/api-keys/:id", async (c) => {
			await apiKeyQueries.deleteApiKey(pool, c.req.param("id"))
			return c.json({ ok: true })
		})
	}

	return app
}
