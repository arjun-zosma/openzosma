import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { cpSync, existsSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import type { AgentProvider, AgentSession } from "@openzosma/agents"
import { PiAgentProvider } from "@openzosma/agents"
import type { Pool } from "@openzosma/db"
import { agentConfigQueries } from "@openzosma/db"
import type { GatewayEvent, Session, SessionMessage } from "./types.js"

/**
 * Per-session state holding the agent session and gateway-level metadata.
 */
interface SessionState {
	agentSession: AgentSession
	session: Session
}

export class SessionManager {
	private sessions = new Map<string, SessionState>()
	private emitters = new Map<string, EventEmitter>()
	private provider: AgentProvider
	private pool: Pool | undefined

	constructor(provider?: AgentProvider, pool?: Pool) {
		this.provider = provider ?? new PiAgentProvider()
		this.pool = pool
	}

	private getEmitter(sessionId: string): EventEmitter {
		let emitter = this.emitters.get(sessionId)
		if (!emitter) {
			emitter = new EventEmitter()
			this.emitters.set(sessionId, emitter)
		}
		return emitter
	}

	/**
	 * Create a new session.
	 *
	 * @param id           Optional session ID — if already exists the existing session is returned.
	 * @param agentConfigId Optional agent config UUID. When provided without `resolvedConfig`,
	 *                      the config is fetched from the DB. Pass `resolvedConfig` to skip
	 *                      that fetch when the caller has already loaded the config (avoids
	 *                      a redundant DB round-trip).
	 * @param resolvedConfig Pre-fetched agent config fields. When provided, `agentConfigId`
	 *                       is still stored on the session for reference but no DB query is made.
	 */
	async createSession(
		id?: string,
		agentConfigId?: string,
		resolvedConfig?: { provider?: string; model?: string; systemPrompt?: string | null; toolsEnabled?: string[] },
	): Promise<Session> {
		// If the caller supplies an ID that already exists, return the existing session.
		if (id) {
			const existing = this.sessions.get(id)
			if (existing) return existing.session
		}

		const session: Session = {
			id: id ?? randomUUID(),
			agentConfigId,
			createdAt: new Date().toISOString(),
			messages: [],
		}

		const workspaceRoot = resolve(process.env.OPENZOSMA_WORKSPACE ?? join(process.cwd(), "workspace"))
		const sessionDir = join(workspaceRoot, "sessions", session.id)
		mkdirSync(sessionDir, { recursive: true })

		const kbRoot = resolve(process.env.KNOWLEDGE_BASE_PATH ?? join(process.cwd(), "../../.knowledge-base"))
		if (existsSync(kbRoot)) {
			cpSync(kbRoot, join(sessionDir, ".knowledge-base"), { recursive: true })
		}

		// Use pre-resolved config when available to avoid a redundant DB fetch.
		// Fall back to a DB lookup when only agentConfigId is given, or to
		// env-based defaults when neither is provided.
		let agentConfig: { provider?: string; model?: string; systemPrompt?: string; toolsEnabled?: string[] } = {}
		if (resolvedConfig) {
			agentConfig = { ...resolvedConfig, systemPrompt: resolvedConfig.systemPrompt ?? undefined }
		} else if (agentConfigId && this.pool) {
			const config = await agentConfigQueries.getAgentConfig(this.pool, agentConfigId)
			if (config) {
				agentConfig = {
					provider: config.provider,
					model: config.model,
					systemPrompt: config.systemPrompt ?? undefined,
					toolsEnabled: config.toolsEnabled,
				}
			}
		}

		const agentSession = this.provider.createSession({
			sessionId: session.id,
			workspaceDir: sessionDir,
			...agentConfig,
		})

		this.sessions.set(session.id, { agentSession, session })
		return session
	}

	getSession(id: string): Session | undefined {
		return this.sessions.get(id)?.session
	}

	deleteSession(id: string): boolean {
		this.emitters.delete(id)
		return this.sessions.delete(id)
	}

	/**
	 * Subscribe to real-time events for a session. Yields events emitted by
	 * any concurrent `sendMessage` call on this session. Keeps the generator
	 * open until `signal` is aborted (client disconnects).
	 *
	 * Used by the SSE endpoint. Will be replaced by Valkey pub/sub in Phase 4.
	 */
	async *subscribe(sessionId: string, signal?: AbortSignal): AsyncGenerator<GatewayEvent> {
		const emitter = this.getEmitter(sessionId)
		const queue: GatewayEvent[] = []
		let notify: (() => void) | undefined

		const onEvent = (event: GatewayEvent) => {
			queue.push(event)
			notify?.()
		}
		const onAbort = () => notify?.()

		emitter.on("event", onEvent)
		signal?.addEventListener("abort", onAbort, { once: true })

		try {
			while (!signal?.aborted) {
				if (queue.length > 0) {
					yield queue.shift()!
				} else {
					await new Promise<void>((r) => {
						notify = r
					})
					notify = undefined
				}
			}
		} finally {
			emitter.off("event", onEvent)
			signal?.removeEventListener("abort", onAbort)
		}
	}

	/**
	 * Send a user message and stream back gateway events.
	 *
	 * Delegates to the configured AgentProvider's session, mapping
	 * AgentStreamEvents to GatewayEvents.
	 */
	async *sendMessage(sessionId: string, content: string, signal?: AbortSignal): AsyncGenerator<GatewayEvent> {
		// Auto-create session on first message if it doesn't exist yet.
		// This allows the web app to use its own conversation IDs directly.
		if (!this.sessions.has(sessionId)) {
			await this.createSession(sessionId)
		}

		const state = this.sessions.get(sessionId)
		if (!state) {
			yield { type: "error", error: `Session ${sessionId} could not be initialized` }
			return
		}
		const { agentSession, session } = state

		// Store user message
		const userMsg: SessionMessage = {
			id: randomUUID(),
			role: "user",
			content,
			createdAt: new Date().toISOString(),
		}
		session.messages.push(userMsg)

		let lastAssistantText = ""
		let lastMessageId: string | undefined
		const emitter = this.getEmitter(sessionId)

		for await (const event of agentSession.sendMessage(content, signal)) {
			const gatewayEvent: GatewayEvent = event as GatewayEvent

			if (event.type === "message_start") {
				lastMessageId = event.id
				lastAssistantText = ""
			} else if (event.type === "message_update" && event.text) {
				lastAssistantText += event.text
			}

			emitter.emit("event", gatewayEvent)
			yield gatewayEvent
		}

		// Store assistant message for session history
		if (lastAssistantText) {
			const assistantMsg: SessionMessage = {
				id: lastMessageId ?? randomUUID(),
				role: "assistant",
				content: lastAssistantText,
				createdAt: new Date().toISOString(),
			}
			session.messages.push(assistantMsg)
		}
	}
}
