import { randomUUID } from "node:crypto"
import type { AgentStreamEvent } from "@openzosma/agents"
import type { Pool } from "@openzosma/db"
import { agentConfigQueries } from "@openzosma/db"
import type { SandboxHttpClient } from "./sandbox-http-client.js"
import type { SandboxManager } from "./sandbox-manager.js"
import type { OrchestratorSession } from "./types.js"

/**
 * Orchestrator session manager.
 *
 * Sits between the gateway and per-user sandboxes. Each user has one
 * persistent sandbox (managed by SandboxManager). Sessions are conversations
 * that run inside a user's sandbox via the sandbox-server HTTP API.
 *
 * This replaces the gateway's in-process SessionManager. Instead of running
 * pi-agent directly, it proxies requests to the sandbox-server running
 * inside each user's OpenShell sandbox.
 */
export class OrchestratorSessionManager {
	private readonly pool: Pool
	private readonly sandboxManager: SandboxManager
	/** In-memory session registry: sessionId -> session metadata. */
	private readonly sessions = new Map<string, OrchestratorSession>()

	constructor(pool: Pool, sandboxManager: SandboxManager) {
		this.pool = pool
		this.sandboxManager = sandboxManager
	}

	// -----------------------------------------------------------------------
	// Session lifecycle
	// -----------------------------------------------------------------------

	/**
	 * Create a session for a user. Ensures the user's sandbox is running,
	 * then creates a session inside it via the sandbox-server HTTP API.
	 */
	async createSession(
		userId: string,
		opts?: {
			sessionId?: string
			agentConfigId?: string
			resolvedConfig?: {
				provider?: string
				model?: string
				systemPrompt?: string | null
				toolsEnabled?: string[]
			}
		},
	): Promise<OrchestratorSession> {
		const sessionId = opts?.sessionId ?? randomUUID()

		// Return existing session if re-requested
		const existing = this.sessions.get(sessionId)
		if (existing) return existing

		// Ensure the user's sandbox is up and ready
		const sandboxState = await this.sandboxManager.ensureSandbox(userId)

		// Resolve agent config
		let agentConfig: {
			provider?: string
			model?: string
			systemPrompt?: string
			toolsEnabled?: string[]
		} = {}

		if (opts?.resolvedConfig) {
			agentConfig = {
				...opts.resolvedConfig,
				systemPrompt: opts.resolvedConfig.systemPrompt ?? undefined,
			}
		} else if (opts?.agentConfigId && this.pool) {
			const config = await agentConfigQueries.getAgentConfig(this.pool, opts.agentConfigId)
			if (config) {
				agentConfig = {
					provider: config.provider,
					model: config.model,
					systemPrompt: config.systemPrompt ?? undefined,
					toolsEnabled: config.toolsEnabled,
				}
			}
		}

		// Create the session inside the sandbox via HTTP
		const client = this.sandboxManager.getHttpClient(userId)
		await client.createSession({
			sessionId,
			provider: agentConfig.provider,
			model: agentConfig.model,
			systemPrompt: agentConfig.systemPrompt,
			toolsEnabled: agentConfig.toolsEnabled,
			agentConfigId: opts?.agentConfigId,
		})

		// Track the session in the sandbox state
		sandboxState.activeSessions.add(sessionId)

		const session: OrchestratorSession = {
			id: sessionId,
			userId,
			sandboxName: sandboxState.sandboxName,
			agentConfigId: opts?.agentConfigId,
			createdAt: new Date().toISOString(),
		}

		this.sessions.set(sessionId, session)
		await this.sandboxManager.touchSandbox(userId)

		return session
	}

	/**
	 * Get session metadata by ID.
	 */
	getSession(sessionId: string): OrchestratorSession | undefined {
		return this.sessions.get(sessionId)
	}

	/**
	 * Delete a session. Removes it from the sandbox and from the registry.
	 */
	async deleteSession(sessionId: string): Promise<boolean> {
		const session = this.sessions.get(sessionId)
		if (!session) return false

		// Remove from sandbox
		try {
			const client = this.sandboxManager.getHttpClient(session.userId)
			await client.deleteSession(sessionId)
		} catch {
			// Sandbox may be gone -- clean up locally regardless
		}

		// Remove from sandbox state tracking
		const sandboxState = this.sandboxManager.getSandboxState(session.userId)
		if (sandboxState) {
			sandboxState.activeSessions.delete(sessionId)
		}

		this.sessions.delete(sessionId)
		return true
	}

	// -----------------------------------------------------------------------
	// Message handling
	// -----------------------------------------------------------------------

	/**
	 * Send a message to a session and stream back agent events.
	 *
	 * Routes the message to the sandbox-server running inside the user's
	 * sandbox and proxies the SSE event stream back.
	 */
	async *sendMessage(
		sessionId: string,
		userId: string,
		content: string,
		signal?: AbortSignal,
	): AsyncGenerator<AgentStreamEvent> {
		// Auto-create session if it doesn't exist
		if (!this.sessions.has(sessionId)) {
			await this.createSession(userId, { sessionId })
		}

		const session = this.sessions.get(sessionId)
		if (!session) {
			yield { type: "error", error: `Session ${sessionId} could not be initialized` }
			return
		}

		// Touch the sandbox to reset idle timer
		await this.sandboxManager.touchSandbox(session.userId)

		// Get the HTTP client for this user's sandbox
		let client: SandboxHttpClient
		try {
			client = this.sandboxManager.getHttpClient(session.userId)
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to connect to sandbox"
			yield { type: "error", error: message }
			return
		}

		// Proxy the SSE stream from the sandbox-server
		try {
			for await (const event of client.sendMessage(sessionId, content, signal)) {
				yield event
			}
		} catch (err) {
			if (!signal?.aborted) {
				const message = err instanceof Error ? err.message : "Unknown sandbox error"
				yield { type: "error", error: message }
			}
		}

		// Touch again after the turn completes
		await this.sandboxManager.touchSandbox(session.userId)
	}

	/**
	 * Cancel an active turn for a session.
	 */
	async cancelSession(sessionId: string): Promise<boolean> {
		const session = this.sessions.get(sessionId)
		if (!session) return false

		try {
			const client = this.sandboxManager.getHttpClient(session.userId)
			return await client.cancelSession(sessionId)
		} catch {
			return false
		}
	}

	// -----------------------------------------------------------------------
	// Queries
	// -----------------------------------------------------------------------

	/**
	 * List all sessions for a user.
	 */
	getSessionsForUser(userId: string): OrchestratorSession[] {
		const result: OrchestratorSession[] = []
		for (const session of this.sessions.values()) {
			if (session.userId === userId) {
				result.push(session)
			}
		}
		return result
	}

	/**
	 * Get the total number of active sessions.
	 */
	get activeSessionCount(): number {
		return this.sessions.size
	}
}
