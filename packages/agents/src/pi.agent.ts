import { randomUUID } from "node:crypto"
import type { AgentSession as PiSdkSession } from "@mariozechner/pi-coding-agent"
import {
	AuthStorage,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	createAgentSession,
} from "@mariozechner/pi-coding-agent"
import { bootstrapMemory } from "@openzosma/memory"
import { DEFAULT_SYSTEM_PROMPT } from "./pi/config.js"
import { bootstrapPiExtensions } from "./pi/extensions/index.js"
import { resolveModel } from "./pi/model.js"
import { createDefaultTools } from "./pi/tools.js"
import type { AgentMessage, AgentProvider, AgentSession, AgentSessionOpts, AgentStreamEvent } from "./types.js"

/**
 * Build a ModelRegistry that knows about a custom provider and its API key.
 * This is needed because pi-coding-agent's AgentSession validates the API key
 * via ModelRegistry.getApiKey() before each prompt. Without registration,
 * custom providers (like "local") fail with "No API key found".
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

	constructor(opts: AgentSessionOpts) {
		const memoryResult = bootstrapMemory({
			workspaceDir: opts.workspaceDir,
			memoryDir: opts.memoryDir,
		})
		const toolList = [...createDefaultTools(opts.workspaceDir, opts.toolsEnabled)]
		const { model, apiKey } = resolveModel({
			provider: opts.provider,
			model: opts.model,
			baseUrl: opts.baseUrl,
		})
		const { extensionPaths } = bootstrapPiExtensions()

		const resourceLoader = new DefaultResourceLoader({
			cwd: opts.workspaceDir,
			additionalExtensionPaths: [...extensionPaths, ...memoryResult.paths],
			systemPrompt: opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
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
				sessionManager: SessionManager.inMemory(),
				resourceLoader,
				modelRegistry,
			})
			if (extensionsResult.errors.length > 0) {
				const extensionErrors = extensionsResult.errors.map((e) => `${e.path}: ${e.error}`).join("; ")
				console.warn(`[openzosma/agents] extension load errors: ${extensionErrors}`)
			}
			return session
		})()
	}

	async *sendMessage(content: string, signal?: AbortSignal): AsyncGenerator<AgentStreamEvent> {
		const session = await this.sessionPromise

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

		function enqueue(event: AgentStreamEvent): void {
			eventQueue.push(event)
			if (resolveWaiting) {
				resolveWaiting()
				resolveWaiting = null
			}
		}

		let fullResponseText = ""
		let messageId = randomUUID()

		const unsubscribe = session.subscribe((event) => {
			switch (event.type) {
				case "agent_start":
					enqueue({ type: "turn_start", id: randomUUID() })
					break

				case "message_start":
					if (event.message.role === "assistant") {
						messageId = randomUUID()
						fullResponseText = ""
						enqueue({ type: "message_start", id: messageId })
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
					}
					break

				case "tool_execution_start":
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
						enqueue({ type: "error", error: errorMessages.join("; ") })
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
				case "turn_end":
				case "auto_compaction_start":
				case "auto_compaction_end":
				case "auto_retry_start":
				case "auto_retry_end":
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

		const promptPromise = session.prompt(promptContent).catch((err: unknown) => {
			const errorMsg = err instanceof Error ? err.message : "Unknown agent error"
			enqueue({ type: "error", error: errorMsg })
			done = true
			if (resolveWaiting) {
				resolveWaiting()
				resolveWaiting = null
			}
		})

		try {
			while (!done || eventQueue.length > 0) {
				if (eventQueue.length > 0) {
					const event = eventQueue.shift()!
					yield event
				} else if (!done) {
					await new Promise<void>((resolve) => {
						resolveWaiting = resolve
					})
				}
			}
		} finally {
			unsubscribe()
			await promptPromise
		}

		if (fullResponseText) {
			const assistantMsg: AgentMessage = {
				id: messageId,
				role: "assistant",
				content: fullResponseText,
				createdAt: new Date().toISOString(),
			}
			this.messages.push(assistantMsg)
		}
	}

	getMessages(): AgentMessage[] {
		return this.messages
	}
}

export class PiAgentProvider implements AgentProvider {
	readonly id = "openzosma-agent"
	readonly name = "OpenZosma Agent"

	createSession(opts: AgentSessionOpts): AgentSession {
		return new PiAgentSession(opts)
	}
}
