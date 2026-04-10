import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type { Api, Model } from "@mariozechner/pi-ai"
import type { AgentSession as PiSdkSession } from "@mariozechner/pi-coding-agent"
import {
	AuthStorage,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	createAgentSession,
} from "@mariozechner/pi-coding-agent"
import { createLogger } from "@openzosma/logger"
import { createMemoryBridge, resolveMemoryExtensionPaths } from "@openzosma/zosma-mem/bridge"
import type { MemoryBridge } from "@openzosma/zosma-mem/bridge"
import { DEFAULT_SYSTEM_PROMPT } from "./pi/config.js"
import { extractFacts } from "./pi/memory.js"
import { resolveModel } from "./pi/model.js"
import {
	createDefaultTools,
	createListDatabaseSchemasTool,
	createQueryDatabaseTool,
	createReportTools,
} from "./pi/tools.js"
import type { AgentMessage, AgentProvider, AgentSession, AgentSessionOpts, AgentStreamEvent } from "./types.js"

const log = createLogger({ component: "agents" })

/**
 * How long (ms) to wait for any event from the agent loop before aborting.
 * When the LLM HTTP request hangs (no error, no response), the agent loop
 * blocks indefinitely in streamAssistantResponse(). This watchdog detects
 * the silence and aborts the session so the retry logic can kick in.
 *
 * Override with OPENZOSMA_LLM_IDLE_TIMEOUT_MS env var.
 */
const LLM_IDLE_TIMEOUT_MS = Number(process.env.OPENZOSMA_LLM_IDLE_TIMEOUT_MS) || 60_000

/**
 * Build a ModelRegistry that knows about a custom provider and its API key.
 * This is needed because pi-coding-agent's AgentSession validates the API key
 * via ModelRegistry.getApiKey() before each prompt. Without registration,
 * custom providers (like openai, anthropic, etc.) fail with "No API key found".
 */
function buildModelRegistry(providerName: string, apiKey: string, baseUrl: string): ModelRegistry {
	const authStorage = AuthStorage.inMemory()
	const registry = new ModelRegistry(authStorage)
	registry.registerProvider(providerName, {
		apiKey,
		baseUrl,
	})
	return registry
}

class PiAgentSession implements AgentSession {
	private sessionPromise: Promise<PiSdkSession>
	private messages: AgentMessage[] = []
	private memoryBridge: MemoryBridge
	private model: Model<Api>
	private apiKey: string

	constructor(opts: AgentSessionOpts) {
		const { model, apiKey } = resolveModel({
			provider: opts.provider,
			model: opts.model,
			baseUrl: opts.baseUrl,
		})
		this.model = model
		this.apiKey = apiKey

		// Stable memory dir: use the explicit memoryDir from opts if provided,
		// otherwise fall back to the default path inside the workspace.
		const memoryDir = opts.memoryDir ?? join(opts.workspaceDir, ".pi", "agent", "memory")
		this.memoryBridge = createMemoryBridge({ memoryDir })

		const toolList = [...createDefaultTools(opts.workspaceDir, opts.toolsEnabled)]
		const reportTools = createReportTools(opts.toolsEnabled, opts.workspaceDir)
		const customTools = [
			...reportTools,
			...(opts.dbPool ? [createQueryDatabaseTool(opts.dbPool), createListDatabaseSchemasTool(opts.dbPool)] : []),
		]

		// Build the final system prompt:
		//   [systemPromptPrefix] + [base prompt] + [systemPromptSuffix]
		// systemPromptPrefix: caller-supplied context (e.g. agent-config overrides)
		// base prompt: DEFAULT_SYSTEM_PROMPT or per-config override
		// systemPromptSuffix: gateway-injected context (e.g. database integration list)
		const basePrompt = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
		const parts = [opts.systemPromptPrefix, basePrompt, opts.systemPromptSuffix].filter(Boolean)
		const finalPrompt = parts.join("\n\n")

		log.info("PiAgentSession: building system prompt", {
			hasPrefix: !!opts.systemPromptPrefix,
			hasSuffix: !!opts.systemPromptSuffix,
			prefixLength: opts.systemPromptPrefix?.length ?? 0,
			suffixLength: opts.systemPromptSuffix?.length ?? 0,
			finalPromptLength: finalPrompt.length,
		})

		// Resolve pi-brain and pi-dcp extension paths. Missing packages are
		// silently skipped — the agent degrades gracefully without them.
		const { paths: memoryExtensionPaths, missing: missingExtensions } = resolveMemoryExtensionPaths()
		if (missingExtensions.length > 0) {
			log.warn("Memory extensions not found — skipping", { missing: missingExtensions })
		}

		const resourceLoader = new DefaultResourceLoader({
			cwd: opts.workspaceDir,
			systemPrompt: finalPrompt,
			additionalExtensionPaths: memoryExtensionPaths,
		})

		// For custom/local providers not in the built-in registry, create a
		// ModelRegistry with the provider registered so that AgentSession.prompt()
		// can resolve the API key. For known providers (openai, anthropic, etc.)
		// the default registry resolves keys from environment variables.
		const isCustomProvider = model.provider === "local" || model.provider === "custom"
		const modelRegistry = isCustomProvider ? buildModelRegistry(model.provider, apiKey, model.baseUrl) : undefined

		this.sessionPromise = (async () => {
			await resourceLoader.reload()
			const { session, extensionsResult } = await createAgentSession({
				cwd: opts.workspaceDir,
				model,
				thinkingLevel: "off",
				tools: toolList,
				customTools,
				sessionManager: SessionManager.inMemory(),
				resourceLoader,
				modelRegistry,
			})
			if (extensionsResult.errors.length > 0) {
				const extensionErrors = extensionsResult.errors.map((e) => `${e.path}: ${e.error}`).join("; ")
				log.warn(`Extension load errors: ${extensionErrors}`)
			}
			return session
		})()
	}

	async *sendMessage(content: string, signal?: AbortSignal): AsyncGenerator<AgentStreamEvent> {
		const session = await this.sessionPromise

		// Retrieve relevant memories and track which ones we injected.
		// We'll use this to record reinforcement signals later.
		let injectedMemoryIds: string[] = []
		try {
			const { context: memoryContext, ids: injectedIds } = await this.memoryBridge.loadContext(content)
			injectedMemoryIds = injectedIds
			if (memoryContext) {
				await session.steer(memoryContext)
				log.info("Memory context injected via steer()", {
					length: memoryContext.length,
					injectedIds: injectedMemoryIds.length,
				})
			}
		} catch (err) {
			log.warn("Failed to load memory context (non-fatal)", {
				error: err instanceof Error ? err.message : String(err),
			})
		}

		const promptContent = content

		const userMsg: AgentMessage = {
			id: randomUUID(),
			role: "user",
			content,
			createdAt: new Date().toISOString(),
		}
		this.messages.push(userMsg)

		const eventQueue: AgentStreamEvent[] = []
		let resolveWaiting: (() => void) | null = null
		let done = false

		// Monotonic timestamps for diagnostic logging
		const t0 = Date.now()
		const elapsed = (): number => Date.now() - t0
		let piEventSeq = 0 // sequence number for ALL pi-mono events (including dropped ones)

		// Idle watchdog: abort the session if no events arrive for LLM_IDLE_TIMEOUT_MS.
		// This catches hanging LLM HTTP requests (no error, no response).
		// The timer is paused while a tool is executing, since tools (e.g. bash)
		// may run for arbitrarily long without emitting intermediate events.
		let idleTimer: ReturnType<typeof setTimeout> | null = null
		let toolRunning = false

		const resetIdleTimer = (): void => {
			if (idleTimer) clearTimeout(idleTimer)
			if (done || toolRunning) return
			idleTimer = setTimeout(() => {
				if (done) return
				log.warn("LLM idle timeout fired, aborting session", {
					timeoutMs: LLM_IDLE_TIMEOUT_MS,
					elapsedMs: elapsed(),
					piEventSeq,
					queueLen: eventQueue.length,
					generatorWaiting: !!resolveWaiting,
					toolRunning,
				})
				enqueue({
					type: "error",
					error: `LLM call timed out after ${LLM_IDLE_TIMEOUT_MS}ms of inactivity`,
				})
				void session.abort()
			}, LLM_IDLE_TIMEOUT_MS)
		}

		const clearIdleTimer = (): void => {
			if (idleTimer) {
				clearTimeout(idleTimer)
				idleTimer = null
			}
		}

		function enqueue(event: AgentStreamEvent): void {
			eventQueue.push(event)
			resetIdleTimer()
			if (resolveWaiting) {
				resolveWaiting()
				resolveWaiting = null
			}
		}

		// Start the idle watchdog (first event should be agent_start)
		resetIdleTimer()

		let fullResponseText = ""
		let messageId = randomUUID()

		const unsubscribe = session.subscribe((event) => {
			piEventSeq++
			const seq = piEventSeq
			const ms = elapsed()

			// Log EVERY event from pi-mono, including ones we don't enqueue.
			// This is the critical diagnostic: if pi-mono emits turn_end + turn_start
			// after tool execution but BEFORE the second LLM call, we will see them here.
			// If we DON'T see them, the agent loop is stuck before emitting.
			log.info("[DIAG] pi-mono event received", {
				seq,
				ms,
				type: event.type,
				role: "message" in event && event.message ? (event.message as { role?: string }).role : undefined,
				queueLen: eventQueue.length,
				generatorWaiting: !!resolveWaiting,
				done,
			})

			switch (event.type) {
				case "agent_start":
					enqueue({ type: "turn_start", id: randomUUID() })
					break

				case "message_start":
					if (event.message.role === "assistant") {
						messageId = randomUUID()
						fullResponseText = ""
						enqueue({ type: "message_start", id: messageId })
					} else {
						// Still reset idle timer for non-assistant message_start
						// so the watchdog knows the agent loop is alive
						resetIdleTimer()
						log.info("[DIAG] non-assistant message_start (idle timer reset, not enqueued)", {
							seq,
							ms,
							role: event.message.role,
						})
					}
					break

				case "message_update": {
					const assistantEvent = event.assistantMessageEvent
					if (assistantEvent.type === "text_delta") {
						fullResponseText += assistantEvent.delta
						enqueue({ type: "message_update", id: messageId, text: assistantEvent.delta })
					} else if (assistantEvent.type === "thinking_delta") {
						enqueue({ type: "thinking_update", id: messageId, text: assistantEvent.delta })
					}
					break
				}

				case "message_end":
					if (event.message.role === "assistant") {
						enqueue({ type: "message_end", id: messageId })
					} else {
						// Still reset idle timer for non-assistant message_end
						resetIdleTimer()
						log.info("[DIAG] non-assistant message_end (idle timer reset, not enqueued)", {
							seq,
							ms,
							role: event.message.role,
						})
					}
					break

				case "tool_execution_start":
					toolRunning = true
					clearIdleTimer()
					enqueue({
						type: "tool_call_start",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						toolArgs: typeof event.args === "string" ? event.args : JSON.stringify(event.args),
					})
					break

				case "tool_execution_update":
					enqueue({
						type: "tool_call_update",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
					})
					break

				case "tool_execution_end": {
					toolRunning = false
					const resultText =
						event.result?.content
							?.map((c: { type: string; text?: string }) => (c.type === "text" ? (c.text ?? "") : ""))
							.join("") ?? ""
					enqueue({
						type: "tool_call_end",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						toolResult: resultText,
						isToolError: event.isError,
					})
					break
				}

				case "agent_end": {
					const errorMessages: string[] = []
					for (const m of event.messages) {
						if (m.role === "assistant" && "errorMessage" in m && m.errorMessage) {
							errorMessages.push(m.errorMessage)
						}
					}
					if (errorMessages.length > 0) {
						enqueue({ type: "error", error: `Agent errors: ${errorMessages.join("; ")}` })
					}
					enqueue({ type: "turn_end", id: randomUUID() })
					done = true
					if (resolveWaiting) {
						resolveWaiting()
						resolveWaiting = null
					}
					break
				}

				case "turn_start":
					// Reset idle timer even though we don't enqueue this event.
					// This proves the agent loop is progressing between turns.
					resetIdleTimer()
					log.info("[DIAG] pi-mono turn_start (idle timer reset, not enqueued)", { seq, ms })
					break

				case "turn_end":
					// Reset idle timer even though we don't enqueue this event.
					resetIdleTimer()
					log.info("[DIAG] pi-mono turn_end (idle timer reset, not enqueued)", { seq, ms })
					break

				case "auto_compaction_start":
					log.info("Auto-compaction started", {
						reason: "reason" in event ? event.reason : undefined,
					})
					enqueue({ type: "auto_compaction_start" })
					break

				case "auto_compaction_end":
					log.info("Auto-compaction ended", {
						aborted: "aborted" in event ? event.aborted : undefined,
						willRetry: "willRetry" in event ? event.willRetry : undefined,
						errorMessage: "errorMessage" in event ? event.errorMessage : undefined,
					})
					enqueue({ type: "auto_compaction_end" })
					break

				case "auto_retry_start":
					log.warn("Auto-retry started (LLM error, retrying)", {
						attempt: "attempt" in event ? event.attempt : undefined,
						maxAttempts: "maxAttempts" in event ? (event.maxAttempts as number) : undefined,
						delayMs: "delayMs" in event ? (event.delayMs as number) : undefined,
						errorMessage: "errorMessage" in event ? (event.errorMessage as string) : undefined,
					})
					enqueue({
						type: "auto_retry_start",
						attempt: "attempt" in event ? (event.attempt as number) : undefined,
						maxAttempts: "maxAttempts" in event ? (event.maxAttempts as number) : undefined,
						delayMs: "delayMs" in event ? (event.delayMs as number) : undefined,
						error: "errorMessage" in event ? (event.errorMessage as string) : undefined,
					})
					break

				case "auto_retry_end":
					log.info("Auto-retry ended", {
						success: "success" in event ? event.success : undefined,
						attempt: "attempt" in event ? (event.attempt as number) : undefined,
						finalError: "finalError" in event ? (event.finalError as string) : undefined,
					})
					enqueue({
						type: "auto_retry_end",
						success: "success" in event ? (event.success as boolean) : undefined,
						attempt: "attempt" in event ? (event.attempt as number) : undefined,
						error: "finalError" in event ? (event.finalError as string) : undefined,
					})
					break

				default:
					// Catch any event types we don't handle, so nothing is silently lost
					log.warn("[DIAG] unhandled pi-mono event type", {
						seq,
						ms,
						type: (event as { type: string }).type,
					})
					resetIdleTimer()
					break
			}
		})

		if (signal) {
			signal.addEventListener(
				"abort",
				() => {
					void session.abort()
				},
				{ once: true },
			)
		}

		log.info("[DIAG] calling session.prompt()", { contentLength: promptContent.length, ms: elapsed() })

		const promptPromise = session.prompt(promptContent).catch((err: unknown) => {
			const errorMsg = err instanceof Error ? err.message : "Unknown agent error"
			log.error("[DIAG] session.prompt() rejected", { error: errorMsg, ms: elapsed(), piEventSeq })
			enqueue({ type: "error", error: `Agent error: ${errorMsg}` })
			done = true
			if (resolveWaiting) {
				resolveWaiting()
				resolveWaiting = null
			}
		})

		promptPromise.then(() => {
			log.info("[DIAG] session.prompt() resolved", { ms: elapsed(), piEventSeq, done })
		})

		let yieldSeq = 0

		try {
			while (!done || eventQueue.length > 0) {
				if (eventQueue.length > 0) {
					const event = eventQueue.shift()!
					yieldSeq++
					if (
						event.type !== "message_update" &&
						event.type !== "thinking_update" &&
						event.type !== "tool_call_update"
					) {
						log.info("[DIAG] yielding event to consumer", {
							yieldSeq,
							type: event.type,
							ms: elapsed(),
							queueLen: eventQueue.length,
						})
					}
					yield event
				} else if (!done) {
					log.info("[DIAG] generator waiting for next event", {
						ms: elapsed(),
						piEventSeq,
						yieldSeq,
					})
					await new Promise<void>((resolve) => {
						resolveWaiting = resolve
					})
					log.info("[DIAG] generator woke up", {
						ms: elapsed(),
						queueLen: eventQueue.length,
						done,
					})
				}
			}
		} finally {
			log.info("[DIAG] generator finally block", { ms: elapsed(), piEventSeq, yieldSeq, done })
			clearIdleTimer()
			unsubscribe()
			await promptPromise
			log.info("[DIAG] generator cleanup complete", { ms: elapsed() })
		}

		if (fullResponseText) {
			const assistantMsg: AgentMessage = {
				id: messageId,
				role: "assistant",
				content: fullResponseText,
				createdAt: new Date().toISOString(),
			}
			this.messages.push(assistantMsg)

			// Record reinforcement signals for memories that were injected and used.
			// This improves future retrieval by boosting the salience of helpful memories.
			if (injectedMemoryIds.length > 0) {
				try {
					// Simple heuristic: if the response references content from injected memories,
					// mark them as "used". This is a basic implementation — could be made more
					// sophisticated with LLM-based correlation in the future.
					let usedCount = 0
					let ignoredCount = 0

					for (const entityId of injectedMemoryIds) {
						// For now, we can't easily correlate entity IDs back to content
						// without querying the engine again. Use a simple heuristic:
						// if the response is longer than 50 chars, assume memories were useful.
						// TODO: Implement proper content-based correlation
						const wasUsed = fullResponseText.length > 50
						await this.memoryBridge.recordUsage(entityId, wasUsed ? "used" : "ignored")
						if (wasUsed) usedCount++
						else ignoredCount++
					}

					log.info("Memory reinforcement recorded", {
						usedCount,
						ignoredCount,
						totalInjected: injectedMemoryIds.length,
					})
				} catch (err) {
					log.warn("Memory reinforcement failed (non-fatal)", {
						error: err instanceof Error ? err.message : String(err),
					})
				}
			}

			// Post-turn memory ingestion: extract memorable facts from this exchange
			// and store them so future conversations can recall them.
			// This is non-blocking and non-critical — errors are logged and ignored.
			extractFacts(this.model, this.apiKey, content, fullResponseText)
				.then((facts) => {
					if (facts.length === 0) return
					log.info("Memory: ingesting extracted facts", { count: facts.length })
					return this.memoryBridge.ingestFacts(facts)
				})
				.catch((err: unknown) => {
					log.warn("Memory ingestion failed (non-fatal)", {
						error: err instanceof Error ? err.message : String(err),
					})
				})
		}
	}

	async steer(content: string): Promise<void> {
		const session = await this.sessionPromise
		await session.steer(content)
	}

	async followUp(content: string): Promise<void> {
		const session = await this.sessionPromise
		await session.followUp(content)
	}

	getMessages(): AgentMessage[] {
		return this.messages
	}

	/** Shutdown the session — run GC and shut down the memory bridge. */
	async dispose(): Promise<void> {
		try {
			await this.memoryBridge.gc()
		} catch (err) {
			log.warn("Memory GC on dispose failed (non-fatal)", {
				error: err instanceof Error ? err.message : String(err),
			})
		}
		this.memoryBridge.shutdown()
	}
}

export class PiAgentProvider implements AgentProvider {
	readonly id = "openzosma-agent"
	readonly name = "OpenZosma Agent"

	createSession(opts: AgentSessionOpts): AgentSession {
		return new PiAgentSession(opts)
	}
}
