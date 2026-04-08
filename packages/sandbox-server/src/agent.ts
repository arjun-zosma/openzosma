import { randomUUID } from "node:crypto"
import type { AgentSession, AgentStreamEvent } from "@openzosma/agents"
import { PiAgentProvider } from "@openzosma/agents"
import { createLogger } from "@openzosma/logger"
import { buildArtifactEvents, copyArtifactsToUserFiles, createSnapshot, detectChanges } from "./file-scanner.js"
import type { FileSnapshot } from "./file-scanner.js"

const log = createLogger({ component: "sandbox-agent" })

const WORKSPACE_DIR = process.env.OPENZOSMA_WORKSPACE ?? "/workspace"

/**
 * Slack capability prompt injected into sessions when SLACK_TOKEN is
 * available but no explicit systemPromptPrefix was provided (e.g. web
 * dashboard sessions). Teaches the agent it can interact with Slack via
 * the agent-slack CLI without duplicating the Slack-adapter-specific
 * context block instructions.
 */
const SLACK_CAPABILITY_PROMPT = `You have Slack integration capabilities via the \`agent-slack\` CLI tool (pre-authenticated via SLACK_TOKEN environment variable). Use it via the bash tool when a user asks you to interact with Slack.

### What you can do with Slack
- List and search channels, users, and messages
- Send messages and files to channels or threads
- Look up user profiles and channel details
- Search across the workspace

### CRITICAL: Always use channel IDs, never bare channel names

**Channel name resolution hangs indefinitely in this environment.** When sending messages, ALWAYS use the channel ID (e.g. \`C096HQPQFA4\`), never the bare channel name (e.g. \`general\` or \`openzosma\`).

Workflow:
1. Run \`agent-slack channel list\` to find the channel ID
2. Send using the ID: \`agent-slack message send "C096HQPQFA4" "Your message"\`

### Common commands

\`\`\`
agent-slack channel list
agent-slack user list --limit 100
agent-slack user get "@username"
agent-slack message list "C0123ABC" --limit 20
agent-slack message send "C0123ABC" "Hello from your AI assistant"
agent-slack message send "C0123ABC" "Here is the report" --attach /path/to/file.pdf
agent-slack search messages "query" --channel "C0123ABC"
\`\`\`

### Rules
- Output is JSON. Use \`| jq '.field'\` for filtering.
- Run each agent-slack command as a separate bash call (no && chains).
- Use channel names without the # prefix (e.g. "general" not "#general").
- Only use flags documented here or in the skill file. Do NOT invent flags.
- \`user list\` lists ALL workspace users. It has NO \`--channel\` flag.

For full reference, read the skill file at \`/app/skills/agent-slack.md\`.`

/** Extended event type that includes file_output. */
export type SandboxEvent =
	| AgentStreamEvent
	| { type: "file_output"; artifacts: { filename: string; mediatype: string; sizebytes: number; content?: string }[] }

/**
 * Derive a human-readable, filesystem-safe folder name from the first user
 * message in a session. A short suffix from the session ID ensures uniqueness.
 *
 * Examples:
 *   "Clone the openzosma repo"        -> "clone-the-openzosma-repo-3e52d2"
 *   "Generate a sales report for Q1"  -> "generate-a-sales-report-for-q1-a7dd63"
 *   ""                                -> "3e52d2e5" (fallback)
 */
const sanitizeFolderName = (message: string, sessionId: string): string => {
	const sanitized = message
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 50)
		.replace(/-$/, "")

	if (!sanitized) return sessionId.slice(0, 8)
	return `${sanitized}-${sessionId.slice(0, 6)}`
}

/**
 * Manages agent sessions inside the sandbox.
 *
 * Each sandbox can host multiple concurrent sessions (e.g. a user may have
 * several chat conversations open). The agent provider runs in-process
 * (inside the sandbox container), backed by pi-coding-agent.
 *
 * After each tool call, the workspace is scanned for new/changed files.
 * These are copied to user-files/ai-generated/<label>/ and metadata is
 * emitted as `file_output` events so the gateway can notify the frontend.
 */
export class SandboxAgentManager {
	private provider = new PiAgentProvider()
	private sessions = new Map<string, AgentSession>()
	private snapshots = new Map<string, Map<string, FileSnapshot>>()
	/** Human-readable folder name per session, derived from the first user message. */
	private sessionLabels = new Map<string, string>()
	/** Abort controllers for active turns, keyed by sessionId. */
	private activeTurnControllers = new Map<string, AbortController>()

	/**
	 * Create a new agent session.
	 *
	 * If SLACK_TOKEN is available and no systemPromptPrefix was provided
	 * by the caller, automatically injects Slack capability instructions
	 * so all sessions (web, API, Slack) know about the agent-slack CLI.
	 */
	createSession(opts?: {
		sessionId?: string
		provider?: string
		model?: string
		systemPrompt?: string
		systemPromptPrefix?: string
		toolsEnabled?: string[]
	}): string {
		const sessionId = opts?.sessionId ?? randomUUID()

		// Auto-inject Slack capability prompt when SLACK_TOKEN is available
		// and the caller did not provide its own systemPromptPrefix
		// (the Slack adapter provides its own richer prefix).
		let effectivePrefix = opts?.systemPromptPrefix
		if (!effectivePrefix && process.env.SLACK_TOKEN) {
			effectivePrefix = SLACK_CAPABILITY_PROMPT
			log.info("Auto-injecting Slack capability prompt (SLACK_TOKEN detected)", { sessionId })
		}

		log.info("SandboxAgentManager.createSession", {
			sessionId,
			hasSystemPromptPrefix: !!effectivePrefix,
			systemPromptPrefixLength: effectivePrefix?.length ?? 0,
			systemPromptPrefixPreview: effectivePrefix?.slice(0, 80) ?? "(none)",
		})

		const agentSession = this.provider.createSession({
			sessionId,
			workspaceDir: WORKSPACE_DIR,
			provider: opts?.provider,
			model: opts?.model,
			systemPrompt: opts?.systemPrompt,
			systemPromptPrefix: effectivePrefix,
			toolsEnabled: opts?.toolsEnabled,
		})

		this.sessions.set(sessionId, agentSession)
		return sessionId
	}

	/**
	 * Send a message to an existing session and yield streamed events.
	 *
	 * After each tool_call_end event, the workspace is scanned for new/changed
	 * files. Changed files are copied to user-files and metadata is emitted.
	 */
	async *sendMessage(sessionId: string, content: string, signal?: AbortSignal): AsyncGenerator<SandboxEvent> {
		const session = this.sessions.get(sessionId)
		if (!session) {
			throw new Error(`Session ${sessionId} not found`)
		}

		// Derive folder label from first message in the session
		if (!this.sessionLabels.has(sessionId)) {
			this.sessionLabels.set(sessionId, sanitizeFolderName(content, sessionId))
		}

		// Create an internal controller for this turn so cancelSession() can abort
		// it independently of the SSE stream disconnect signal.
		const turnController = new AbortController()
		this.activeTurnControllers.set(sessionId, turnController)

		// Propagate the external abort signal (SSE client disconnect) into the turn controller.
		const onExternalAbort = () => turnController.abort()
		if (signal?.aborted) {
			turnController.abort()
		} else {
			signal?.addEventListener("abort", onExternalAbort, { once: true })
		}

		// Take initial snapshot for artifact detection
		let snapshot = this.snapshots.get(sessionId) ?? createSnapshot(WORKSPACE_DIR)

		const t0 = Date.now()
		let yieldCount = 0
		log.info("[DIAG-AGM] starting for-await on session.sendMessage()", { sessionId })

		try {
			for await (const event of session.sendMessage(content, turnController.signal)) {
				yieldCount++
				if (event.type !== "message_update" && event.type !== "thinking_update" && event.type !== "tool_call_update") {
					log.info("[DIAG-AGM] received event from PiAgentSession", {
						sessionId,
						yieldCount,
						type: event.type,
						ms: Date.now() - t0,
					})
				}
				yield event

				// After a tool call ends, scan for new output files
				if (event.type === "tool_call_end") {
					const scanStart = Date.now()
					const result = this.scanForArtifacts(sessionId, snapshot)
					const scanMs = Date.now() - scanStart
					if (scanMs > 100) {
						log.warn("[DIAG-AGM] slow artifact scan", { sessionId, scanMs })
					}
					if (result) {
						snapshot = result.newSnapshot
						yield { type: "file_output", artifacts: result.artifacts }
					}
				}
			}

			log.info("[DIAG-AGM] for-await loop completed", {
				sessionId,
				yieldCount,
				durationMs: Date.now() - t0,
			})

			// Final scan after the turn completes to catch stragglers
			const finalResult = this.scanForArtifacts(sessionId, snapshot)
			if (finalResult) {
				snapshot = finalResult.newSnapshot
				yield { type: "file_output", artifacts: finalResult.artifacts }
			}

			// Persist snapshot for next turn
			this.snapshots.set(sessionId, snapshot)
		} finally {
			signal?.removeEventListener("abort", onExternalAbort)
			this.activeTurnControllers.delete(sessionId)
		}
	}

	/**
	 * Scan workspace for changed files, copy them to user-files, and build artifact event payloads.
	 */
	private scanForArtifacts(
		sessionId: string,
		previousSnapshot: Map<string, FileSnapshot>,
	): {
		newSnapshot: Map<string, FileSnapshot>
		artifacts: { filename: string; mediatype: string; sizebytes: number; content?: string }[]
	} | null {
		const { newSnapshot, changedFiles } = detectChanges(WORKSPACE_DIR, previousSnapshot)
		if (changedFiles.length === 0) return null

		// Copy detected files to /workspace/user-files/ai-generated/<label>/
		const folderName = this.sessionLabels.get(sessionId) ?? sessionId
		copyArtifactsToUserFiles(folderName, changedFiles)

		const artifacts = buildArtifactEvents(changedFiles)
		if (artifacts.length === 0) return null

		return { newSnapshot, artifacts }
	}

	/**
	 * Deliver a steering message to the active turn of a session.
	 */
	async steer(sessionId: string, content: string): Promise<void> {
		const session = this.sessions.get(sessionId)
		if (!session) throw new Error(`Session ${sessionId} not found`)
		await session.steer(content)
	}

	/**
	 * Queue a follow-up message for after the current turn ends.
	 */
	async followUp(sessionId: string, content: string): Promise<void> {
		const session = this.sessions.get(sessionId)
		if (!session) throw new Error(`Session ${sessionId} not found`)
		await session.followUp(content)
	}

	/**
	 * Cancel the active turn for a session.
	 *
	 * Aborts the in-flight LLM call / tool execution without destroying the
	 * session or its message history. The session remains usable for further
	 * messages after cancellation.
	 *
	 * Returns true if there was an active turn to cancel, false if the session
	 * has no in-progress turn.
	 */
	cancelSession(sessionId: string): boolean {
		const controller = this.activeTurnControllers.get(sessionId)
		if (!controller) return false
		controller.abort()
		this.activeTurnControllers.delete(sessionId)
		return true
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
		this.cancelSession(sessionId)
		this.snapshots.delete(sessionId)
		this.sessionLabels.delete(sessionId)
		return this.sessions.delete(sessionId)
	}

	/**
	 * List all active session IDs.
	 */
	listSessions(): string[] {
		return [...this.sessions.keys()]
	}
}
