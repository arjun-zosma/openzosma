import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { cpSync, existsSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import type { AgentProvider, AgentSession } from "@openzosma/agents"
import { PiAgentProvider } from "@openzosma/agents"
import type { Pool } from "@openzosma/db"
import { agentConfigQueries } from "@openzosma/db"
import type { OrchestratorSessionManager } from "@openzosma/orchestrator"
import { ArtifactManager } from "./artifact-manager.js"
import { createSnapshot, detectChanges } from "./file-scanner.js"
import type { FileArtifact, GatewayEvent, Session, SessionMessage } from "./types.js"

/**
 * Per-session state holding the agent session and gateway-level metadata.
 * Used only in local (non-orchestrator) mode.
 */
interface SessionState {
	agentSession: AgentSession
	session: Session
	/** Absolute path to the session's workspace directory. Only set in local mode. */
	workspaceDir?: string
}

/**
 * Gateway session manager.
 *
 * Operates in two modes:
 *
 * 1. **Local mode** (default): Runs pi-agent directly in-process. This is the
 *    pre-Phase-4 behavior and serves as the development fallback.
 *
 * 2. **Orchestrator mode**: Delegates session lifecycle and message routing
 *    to the OrchestratorSessionManager, which proxies to sandbox-server
 *    instances running inside per-user OpenShell sandboxes.
 *
 * The mode is determined by whether an `orchestrator` is passed to the
 * constructor. When the orchestrator is present, all operations that involve
 * agent execution are delegated. Session metadata is still tracked locally
 * for the gateway's own needs (SSE subscriptions, message history).
 */
export class SessionManager {
	private sessions = new Map<string, SessionState>()
	private emitters = new Map<string, EventEmitter>()
	private provider: AgentProvider
	private pool: Pool | undefined
	private orchestrator: OrchestratorSessionManager | undefined
	readonly artifactManager: ArtifactManager
	/**
	 * Mutex that serializes the critical section between setting PI_MEMORY_DIR
	 * (process.env) and the jiti extension import that reads it. Without this,
	 * concurrent createSession() calls would race on the shared env var.
	 */
	private initLock: Promise<void> = Promise.resolve()

	constructor(opts?: { provider?: AgentProvider; pool?: Pool; orchestrator?: OrchestratorSessionManager }) {
		this.provider = opts?.provider ?? new PiAgentProvider()
		this.pool = opts?.pool
		this.orchestrator = opts?.orchestrator
		const workspaceRoot = resolve(process.env.OPENZOSMA_WORKSPACE ?? join(process.cwd(), "workspace"))
		this.artifactManager = new ArtifactManager(workspaceRoot)
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
	 * @param id           Optional session ID -- if already exists, the existing session is returned.
	 * @param agentConfigId Optional agent config UUID.
	 * @param resolvedConfig Pre-fetched agent config fields.
	 * @param userId        User ID (required in orchestrator mode).
	 */
	async createSession(
		id?: string,
		agentConfigId?: string,
		resolvedConfig?: { provider?: string; model?: string; systemPrompt?: string | null; toolsEnabled?: string[] },
		userId?: string,
	): Promise<Session> {
		// If the caller supplies an ID that already exists, return the existing session.
		if (id) {
			const existing = this.sessions.get(id)
			if (existing) return existing.session
		}

		const sessionId = id ?? randomUUID()

		// -- Orchestrator mode --
		if (this.orchestrator) {
			if (!userId) {
				throw new Error(
					"userId is required in orchestrator mode. " +
						"Ensure the caller extracts userId from the auth context before calling createSession.",
				)
			}

			const orchSession = await this.orchestrator.createSession(userId, {
				sessionId,
				agentConfigId,
				resolvedConfig,
			})

			// Create a local Session object for gateway-level tracking
			const session: Session = {
				id: orchSession.id,
				agentConfigId,
				createdAt: orchSession.createdAt,
				messages: [],
			}

			// Store a stub SessionState (no local agentSession in orchestrated mode)
			this.sessions.set(session.id, {
				agentSession: null as unknown as AgentSession,
				session,
			})

			return session
		}

		// -- Local mode --
		const session: Session = {
			id: sessionId,
			agentConfigId,
			createdAt: new Date().toISOString(),
			messages: [],
		}

		const workspaceRoot = resolve(process.env.OPENZOSMA_WORKSPACE ?? join(process.cwd(), "workspace"))
		const sessionDir = join(workspaceRoot, "sessions", session.id)
		mkdirSync(sessionDir, { recursive: true })

		// Memory must persist across sessions. Use a stable directory keyed by
		// agent config, or a shared default when no config is specified.
		const memoryKey = agentConfigId ?? "default"
		const memoryDir = join(workspaceRoot, "agents", memoryKey, "memory")
		mkdirSync(memoryDir, { recursive: true })
		const kbRoot = resolve(process.env.KNOWLEDGE_BASE_PATH ?? join(process.cwd(), "../../.knowledge-base"))
		if (existsSync(kbRoot)) {
			cpSync(kbRoot, join(sessionDir, ".knowledge-base"), { recursive: true })
		}

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

		// Serialize session creation so that process.env.PI_MEMORY_DIR (set by
		// bootstrapMemory, read by pi-memory at jiti import time) is not clobbered
		// by a concurrent session before the extension loader reads it.
		const prevLock = this.initLock
		let releaseLock: () => void
		this.initLock = new Promise<void>((r) => {
			releaseLock = r
		})
		await prevLock

		const agentSession = this.provider.createSession({
			sessionId: session.id,
			workspaceDir: sessionDir,
			memoryDir,
			...agentConfig,
		})

		// Release the lock after a short delay to let the extension loader read
		// PI_MEMORY_DIR. The env var is set synchronously in the PiAgentSession
		// constructor (which ran above), and the jiti import happens in the async
		// init inside that constructor. A 100ms window is conservative.
		setTimeout(() => releaseLock!(), 100)

		this.sessions.set(session.id, { agentSession, session, workspaceDir: sessionDir })
		return session
	}

	getSession(id: string): Session | undefined {
		return this.sessions.get(id)?.session
	}

	deleteSession(id: string): boolean {
		if (this.orchestrator) {
			const session = this.sessions.get(id)
			if (session) {
				// Fire-and-forget orchestrator cleanup
				void this.orchestrator.deleteSession(id)
			}
		}
		this.emitters.delete(id)
		this.artifactManager.deleteArtifacts(id)
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
	 * In orchestrator mode, delegates to the sandbox-server via the
	 * OrchestratorSessionManager. In local mode, runs pi-agent in-process.
	 * After each tool call ends, the workspace is scanned for new output files
	 * which are promoted to the artifacts directory and emitted as `file_output` events.
	 *
	 * @param userId Required in orchestrator mode; ignored in local mode.
	 */
	async *sendMessage(
		sessionId: string,
		content: string,
		signal?: AbortSignal,
		userId?: string,
	): AsyncGenerator<GatewayEvent> {
		// -- Orchestrator mode --
		if (this.orchestrator) {
			if (!userId) {
				yield { type: "error", error: "userId is required in orchestrator mode" }
				return
			}

			// Ensure session exists in gateway state
			if (!this.sessions.has(sessionId)) {
				try {
					await this.createSession(sessionId, undefined, undefined, userId)
				} catch (err) {
					const message = err instanceof Error ? err.message : "Failed to create session"
					yield { type: "error", error: message }
					return
				}
			}

			const state = this.sessions.get(sessionId)
			if (!state) {
				yield { type: "error", error: `Session ${sessionId} could not be initialized` }
				return
			}

			// Store user message
			const userMsg: SessionMessage = {
				id: randomUUID(),
				role: "user",
				content,
				createdAt: new Date().toISOString(),
			}
			state.session.messages.push(userMsg)

			let lastAssistantText = ""
			let lastMessageId: string | undefined
			const emitter = this.getEmitter(sessionId)

			for await (const event of this.orchestrator.sendMessage(sessionId, userId, content, signal)) {
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

			if (lastAssistantText) {
				const assistantMsg: SessionMessage = {
					id: lastMessageId ?? randomUUID(),
					role: "assistant",
					content: lastAssistantText,
					createdAt: new Date().toISOString(),
				}
				state.session.messages.push(assistantMsg)
			}

			return
		}

		// -- Local mode --
		// Auto-create session on first message if it doesn't exist yet.
		if (!this.sessions.has(sessionId)) {
			await this.createSession(sessionId)
		}

		const state = this.sessions.get(sessionId)
		if (!state) {
			yield { type: "error", error: `Session ${sessionId} could not be initialized` }
			return
		}
		const { agentSession, session, workspaceDir } = state

		if (!workspaceDir) {
			yield { type: "error", error: "Local mode session not properly initialized" }
			return
		}

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

		// Take initial workspace snapshot for artifact detection
		let snapshot = createSnapshot(workspaceDir)

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

			// After a tool call ends, scan for new output files
			if (event.type === "tool_call_end") {
				const artifacts = await this.scanAndPromoteArtifacts(sessionId, workspaceDir, snapshot)
				if (artifacts) {
					snapshot = artifacts.newSnapshot
					const fileEvent: GatewayEvent = {
						type: "file_output",
						artifacts: artifacts.promoted,
					}
					emitter.emit("event", fileEvent)
					yield fileEvent
				}
			}
		}

		// Final scan after the turn completes to catch any stragglers
		const finalArtifacts = await this.scanAndPromoteArtifacts(sessionId, workspaceDir, snapshot)
		if (finalArtifacts) {
			const fileEvent: GatewayEvent = {
				type: "file_output",
				artifacts: finalArtifacts.promoted,
			}
			emitter.emit("event", fileEvent)
			yield fileEvent
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

	/**
	 * Scans the workspace for changed files and promotes any new output
	 * files to the artifacts directory.
	 *
	 * Returns null if no new artifacts were found.
	 */
	private async scanAndPromoteArtifacts(
		sessionId: string,
		workspaceDir: string,
		previousSnapshot: Map<string, { relativePath: string; mtimeMs: number; sizebytes: number }>,
	): Promise<{ newSnapshot: typeof previousSnapshot; promoted: FileArtifact[] } | null> {
		const { newSnapshot, changedFiles } = detectChanges(workspaceDir, previousSnapshot)

		if (changedFiles.length === 0) return null

		const promoted = await this.artifactManager.promoteFiles(sessionId, changedFiles)
		if (promoted.length === 0) return null

		return {
			newSnapshot,
			promoted: promoted.map((a) => ({
				filename: a.filename,
				mediatype: a.mediatype,
				sizebytes: a.sizebytes,
			})),
		}
	}
}
