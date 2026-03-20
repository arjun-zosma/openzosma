import type { AgentConfig } from "@openzosma/db"
import type {
	Task,
	SendMessageRequest,
	SendMessageResponse,
	SendMessageStreamingRequest,
	SendMessageStreamingResponse,
	CancelTaskRequest,
	CancelTaskResponse,
	TaskResubscriptionRequest,
} from "a2a-js"
import {
	Role,
	TaskState,
	DefaultA2ARequestHandler,
	OperationNotSupportedError,
	JSONRPCErrorCode,
} from "a2a-js"
import type { AgentExecutor } from "a2a-js"
import type { A2ASessionProvider } from "./types.js"

function extractUserText(parts: Array<{ type: string; text?: string }>): string | null {
	const text = parts
		.filter((p) => p.type === "text" && typeof p.text === "string")
		.map((p) => p.text)
		.join("")
	return text || null
}

export class OpenZosmaAgentExecutor implements AgentExecutor {
	private sessionProvider: A2ASessionProvider
	private agentConfigId: string
	private resolvedConfig: {
		provider: string
		model: string
		systemPrompt: string | null
		toolsEnabled: string[]
	}
	private abortControllers = new Map<string, AbortController>()

	constructor(
		sessionProvider: A2ASessionProvider,
		agentConfigId: string,
		resolvedConfig: {
			provider: string
			model: string
			systemPrompt: string | null
			toolsEnabled: string[]
		},
	) {
		this.sessionProvider = sessionProvider
		this.agentConfigId = agentConfigId
		this.resolvedConfig = resolvedConfig
	}

	cancelTask(taskId: string): void {
		const ctrl = this.abortControllers.get(taskId)
		if (ctrl) {
			ctrl.abort()
			this.abortControllers.delete(taskId)
		}
	}

	async onMessageSend(
		request: SendMessageRequest,
		task?: Task,
	): Promise<SendMessageResponse> {
		const params = request.params as unknown as Record<string, unknown>
		const taskId = (params["id"] as string | undefined) ?? task?.id
		if (!taskId) {
			return {
				jsonrpc: "2.0",
				id: request.id,
				error: { code: JSONRPCErrorCode.InvalidParams, message: "Task ID is required" },
			}
		}

		const message = params["message"] as { parts?: Array<{ type: string; text?: string }> } | undefined
		const userText = message?.parts ? extractUserText(message.parts) : null
		if (!userText) {
			return {
				jsonrpc: "2.0",
				id: request.id,
				error: { code: JSONRPCErrorCode.InvalidParams, message: "Message must have at least one text part" },
			}
		}

		await this.sessionProvider.createSession(taskId, this.agentConfigId, this.resolvedConfig)

		const abort = new AbortController()
		this.abortControllers.set(taskId, abort)

		let assistantText = ""

		try {
			for await (const event of this.sessionProvider.sendMessage(taskId, userText, abort.signal)) {
				if (event.type === "message_update" && event.text) {
					assistantText += event.text
				}
			}
		} catch (e) {
			this.abortControllers.delete(taskId)
			const resultTask: Task = {
				id: taskId,
				sessionId: taskId,
				status: {
					state: abort.signal.aborted ? TaskState.Canceled : TaskState.Failed,
					message: {
						role: Role.Agent,
						parts: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
					},
				},
			}
			return { jsonrpc: "2.0", id: request.id, result: resultTask }
		}

		this.abortControllers.delete(taskId)

		const resultTask: Task = {
			id: taskId,
			sessionId: taskId,
			status: { state: TaskState.Completed },
			history: [
				{ role: Role.User, parts: [{ type: "text", text: userText }] },
				{ role: Role.Agent, parts: [{ type: "text", text: assistantText }] },
			],
		}

		return { jsonrpc: "2.0", id: request.id, result: resultTask }
	}

	async *onMessageStream(
		request: SendMessageStreamingRequest,
		task?: Task,
	): AsyncGenerator<SendMessageStreamingResponse, void, unknown> {
		const params = request.params as unknown as Record<string, unknown>
		const taskId = (params["id"] as string | undefined) ?? task?.id
		if (!taskId) {
			yield {
				jsonrpc: "2.0",
				id: request.id,
				error: { code: JSONRPCErrorCode.InvalidParams, message: "Task ID is required" },
			}
			return
		}

		const message = params["message"] as { parts?: Array<{ type: string; text?: string }> } | undefined
		const userText = message?.parts ? extractUserText(message.parts) : null
		if (!userText) {
			yield {
				jsonrpc: "2.0",
				id: request.id,
				error: { code: JSONRPCErrorCode.InvalidParams, message: "Message must have at least one text part" },
			}
			return
		}

		await this.sessionProvider.createSession(taskId, this.agentConfigId, this.resolvedConfig)

		const abort = new AbortController()
		this.abortControllers.set(taskId, abort)

		yield {
			jsonrpc: "2.0",
			id: request.id,
			result: {
				role: Role.Agent,
				parts: [{ type: "text", text: "" }],
				metadata: { taskId, state: TaskState.Working },
			},
		}

		let assistantText = ""

		try {
			for await (const event of this.sessionProvider.sendMessage(taskId, userText, abort.signal)) {
				if (event.type === "message_update" && event.text) {
					assistantText += event.text
					yield {
						jsonrpc: "2.0",
						id: request.id,
						result: {
							role: Role.Agent,
							parts: [{ type: "text", text: event.text }],
							metadata: { taskId, state: TaskState.Working },
						},
					}
				}
			}

			yield {
				jsonrpc: "2.0",
				id: request.id,
				result: {
					role: Role.Agent,
					parts: [{ type: "text", text: assistantText }],
					metadata: { taskId, state: TaskState.Completed, final: true },
				},
			}
		} catch (e) {
			const state = abort.signal.aborted ? TaskState.Canceled : TaskState.Failed
			yield {
				jsonrpc: "2.0",
				id: request.id,
				result: {
					role: Role.Agent,
					parts: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
					metadata: { taskId, state, final: true },
				},
			}
		} finally {
			this.abortControllers.delete(taskId)
		}
	}

	async onCancel(
		request: CancelTaskRequest,
		task: Task,
	): Promise<CancelTaskResponse> {
		this.cancelTask(task.id)
		const updated: Task = {
			...task,
			status: { state: TaskState.Canceled },
		}
		return { jsonrpc: "2.0", id: request.id, result: updated }
	}

	async *onResubscribe(
		_request: TaskResubscriptionRequest,
		_task: Task,
	): AsyncGenerator<SendMessageStreamingResponse, void, unknown> {
		yield {
			jsonrpc: "2.0",
			id: _request.id,
			error: new OperationNotSupportedError(),
		}
	}
}

// ---------------------------------------------------------------------------
// Per-agent handler cache
// ---------------------------------------------------------------------------

export interface AgentHandler {
	requestHandler: DefaultA2ARequestHandler
	executor: OpenZosmaAgentExecutor
}

export function getOrCreateHandler(
	handlers: Map<string, AgentHandler>,
	configId: string,
	config: AgentConfig,
	sessionProvider: A2ASessionProvider,
): AgentHandler {
	const existing = handlers.get(configId)
	if (existing) return existing

	const executor = new OpenZosmaAgentExecutor(sessionProvider, configId, {
		provider: config.provider,
		model: config.model,
		systemPrompt: config.systemPrompt,
		toolsEnabled: config.toolsEnabled,
	})
	const requestHandler = new DefaultA2ARequestHandler(executor)
	const handler: AgentHandler = { requestHandler, executor }
	handlers.set(configId, handler)
	return handler
}
