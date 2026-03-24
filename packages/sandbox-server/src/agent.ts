import { randomUUID } from "node:crypto"
import type { AgentSession, AgentStreamEvent } from "@openzosma/agents"
import { PiAgentProvider } from "@openzosma/agents"

const WORKSPACE_DIR = process.env.OPENZOSMA_WORKSPACE ?? "/workspace"

/**
 * Manages agent sessions inside the sandbox.
 *
 * Each sandbox can host multiple concurrent sessions (e.g. a user may have
 * several chat conversations open). The agent provider runs in-process
 * (inside the sandbox container), backed by pi-coding-agent.
 */
export class SandboxAgentManager {
	private provider = new PiAgentProvider()
	private sessions = new Map<string, AgentSession>()

	/**
	 * Create a new agent session.
	 */
	createSession(opts?: {
		sessionId?: string
		provider?: string
		model?: string
		systemPrompt?: string
		toolsEnabled?: string[]
	}): string {
		const sessionId = opts?.sessionId ?? randomUUID()

		const agentSession = this.provider.createSession({
			sessionId,
			workspaceDir: WORKSPACE_DIR,
			provider: opts?.provider,
			model: opts?.model,
			systemPrompt: opts?.systemPrompt,
			toolsEnabled: opts?.toolsEnabled,
		})

		this.sessions.set(sessionId, agentSession)
		return sessionId
	}

	/**
	 * Send a message to an existing session and yield streamed events.
	 */
	async *sendMessage(sessionId: string, content: string, signal?: AbortSignal): AsyncGenerator<AgentStreamEvent> {
		const session = this.sessions.get(sessionId)
		if (!session) {
			throw new Error(`Session ${sessionId} not found`)
		}
		yield* session.sendMessage(content, signal)
	}

	/**
	 * Check if a session exists.
	 */
	hasSession(sessionId: string): boolean {
		return this.sessions.has(sessionId)
	}

	/**
	 * Delete a session.
	 */
	deleteSession(sessionId: string): boolean {
		return this.sessions.delete(sessionId)
	}

	/**
	 * List all active session IDs.
	 */
	listSessions(): string[] {
		return [...this.sessions.keys()]
	}
}
