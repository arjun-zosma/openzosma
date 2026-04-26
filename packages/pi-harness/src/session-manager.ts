import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import type { AgentSession, AgentStreamEvent } from "@openzosma/agents"
import { PiAgentProvider } from "@openzosma/agents"
import type { HarnessConfig } from "./config.js"
import { createLogger } from "./logger.js"

const log = createLogger({ component: "pi-harness" })

/** Per-session state tracked by the harness. */
interface HarnessSession {
	agentSession: AgentSession
	sessionId: string
	workspaceDir: string
	createdAt: string
	lastActiveAt: number
}

/**
 * Manages agent sessions for the pi-harness standalone server.
 *
 * Each session gets its own pi-coding-agent instance with an isolated
 * workspace directory. Sessions run concurrently in the same Node.js
 * process — pi-coding-agent was refactored for this in Phase 1.
 */
export class HarnessSessionManager {
	private provider = new PiAgentProvider()
	private sessions = new Map<string, HarnessSession>()
	private config: HarnessConfig

	constructor(config: HarnessConfig) {
		this.config = config
		// Ensure workspace root exists
		if (!existsSync(config.workspaceRoot)) {
			mkdirSync(config.workspaceRoot, { recursive: true })
		}
		// Start idle cleanup loop if configured
		if (config.sessionIdleTimeoutMinutes > 0) {
			this.startIdleCleanup()
		}
	}

	/**
	 * Create a new agent session.
	 *
	 * Returns the session ID. The session is ready to receive messages
	 * immediately.
	 */
	createSession(opts?: {
		sessionId?: string
		provider?: string
		model?: string
		systemPrompt?: string
		systemPromptPrefix?: string
		systemPromptSuffix?: string
		toolsEnabled?: string[]
		workspaceDir?: string
	}): string {
		// Enforce max sessions limit
		if (this.config.maxSessions > 0 && this.sessions.size >= this.config.maxSessions) {
			throw new Error(`Maximum sessions reached (${this.config.maxSessions})`)
		}

		const sessionId = opts?.sessionId ?? randomUUID()

		// Derive workspace directory
		const workspaceDir = opts?.workspaceDir
			? resolve(opts.workspaceDir)
			: resolve(this.config.workspaceRoot, "sessions", sessionId)

		mkdirSync(workspaceDir, { recursive: true })

		// Use configured defaults if not overridden
		const provider = opts?.provider ?? this.config.defaultProvider
		const model = opts?.model ?? this.config.defaultModel
		const toolsEnabled = opts?.toolsEnabled ?? this.config.defaultTools
		const systemPromptPrefix = opts?.systemPromptPrefix ?? this.config.defaultSystemPromptPrefix
		const systemPromptSuffix = opts?.systemPromptSuffix ?? this.config.defaultSystemPromptSuffix

		// Configure extensions directory if set
		if (this.config.extensionsDir) {
			process.env.PI_EXTENSIONS_DIR = this.config.extensionsDir
		}

		log.info("Creating session", { sessionId, provider, model, workspaceDir, toolsEnabled: toolsEnabled?.length })

		const agentSession = this.provider.createSession({
			sessionId,
			workspaceDir,
			provider,
			model,
			systemPrompt: opts?.systemPrompt,
			systemPromptPrefix,
			systemPromptSuffix,
			toolsEnabled,
		})

		const now = Date.now()
		this.sessions.set(sessionId, {
			agentSession,
			sessionId,
			workspaceDir,
			createdAt: new Date(now).toISOString(),
			lastActiveAt: now,
		})

		return sessionId
	}

	/**
	 * Send a message to a session and yield streamed agent events.
	 */
	async *sendMessage(sessionId: string, content: string, signal?: AbortSignal): AsyncGenerator<AgentStreamEvent> {
		const session = this.sessions.get(sessionId)
		if (!session) {
			throw new Error(`Session ${sessionId} not found`)
		}

		// Update last activity
		session.lastActiveAt = Date.now()

		try {
			for await (const event of session.agentSession.sendMessage(content, signal)) {
				yield event
			}
		} finally {
			session.lastActiveAt = Date.now()
		}
	}

	/**
	 * Deliver a steering message to an active session turn.
	 */
	async steer(sessionId: string, content: string): Promise<void> {
		const session = this.sessions.get(sessionId)
		if (!session) throw new Error(`Session ${sessionId} not found`)
		await session.agentSession.steer(content)
	}

	/**
	 * Queue a follow-up message for after the current turn ends.
	 */
	async followUp(sessionId: string, content: string): Promise<void> {
		const session = this.sessions.get(sessionId)
		if (!session) throw new Error(`Session ${sessionId} not found`)
		await session.agentSession.followUp(content)
	}

	/**
	 * Cancel the active turn for a session.
	 */
	async cancelSession(sessionId: string): Promise<boolean> {
		const session = this.sessions.get(sessionId)
		if (!session) return false
		// The agent session's sendMessage accepts an AbortSignal.
		// Cancellation is handled by the caller aborting that signal.
		// This method is a no-op at the harness level — provided for API symmetry.
		return true
	}

	/**
	 * Check if a session exists.
	 */
	hasSession(sessionId: string): boolean {
		return this.sessions.has(sessionId)
	}

	/**
	 * Get session metadata.
	 */
	getSession(sessionId: string): { sessionId: string; createdAt: string; workspaceDir: string } | undefined {
		const session = this.sessions.get(sessionId)
		if (!session) return undefined
		return {
			sessionId: session.sessionId,
			createdAt: session.createdAt,
			workspaceDir: session.workspaceDir,
		}
	}

	/**
	 * End and remove a session.
	 */
	deleteSession(sessionId: string): boolean {
		const existed = this.sessions.delete(sessionId)
		if (existed) {
			log.info("Session ended", { sessionId })
		}
		return existed
	}

	/**
	 * List all active session IDs.
	 */
	listSessions(): string[] {
		return [...this.sessions.keys()]
	}

	/**
	 * Get count of active sessions.
	 */
	getSessionCount(): number {
		return this.sessions.size
	}

	/**
	 * Background loop that cleans up idle sessions.
	 */
	private startIdleCleanup(): void {
		const intervalMs = 60_000 // Check every minute
		const timeoutMs = this.config.sessionIdleTimeoutMinutes * 60_000

		setInterval(() => {
			const now = Date.now()
			for (const [sessionId, session] of this.sessions) {
				if (now - session.lastActiveAt > timeoutMs) {
					log.info("Idle session timed out", { sessionId, idleMinutes: this.config.sessionIdleTimeoutMinutes })
					this.deleteSession(sessionId)
				}
			}
		}, intervalMs)

		// Prevent the interval from keeping the process alive
		// (the HTTP server keeps it alive anyway, but this is good hygiene)
		// Note: we intentionally don't unref — the HTTP server is the primary keepalive
	}
}
