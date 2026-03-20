/**
 * A2A Hono routes — thin routing layer.
 *
 * All protocol logic (card building, executor, handler cache) lives in
 * @openzosma/a2a. This file only wires those pieces into Hono routes
 * and handles SSE streaming via Hono's streamSSE helper.
 *
 * URL structure:
 *   GET  /a2a/agents                         — list all agent cards
 *   GET  /a2a/agents/:configId/agent.json    — card for one agent
 *   POST /a2a/agents/:configId               — JSON-RPC 2.0 endpoint
 */

import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { Pool } from "@openzosma/db"
import { agentConfigQueries } from "@openzosma/db"
import {
	buildAllAgentCards,
	buildAgentCardForConfig,
	getOrCreateHandler,
	type AgentHandler,
} from "@openzosma/a2a"
import type { A2ASessionProvider } from "@openzosma/a2a"
import type {
	JSONRPCRequest,
	SendMessageRequest,
	SendMessageStreamingRequest,
	CancelTaskRequest,
} from "a2a-js"
import { JSONRPCErrorCode } from "a2a-js"

export function createPerAgentRouter(sessionProvider: A2ASessionProvider, pool: Pool): Hono {
	const handlers = new Map<string, AgentHandler>()
	const router = new Hono()

	router.get("/agents", async (c) => {
		const cards = await buildAllAgentCards(pool)
		return c.json(cards)
	})

	router.get("/agents/:configId/agent.json", async (c) => {
		const configId = c.req.param("configId")
		const config = await agentConfigQueries.getAgentConfig(pool, configId)
		if (!config) {
			return c.json({ error: "Agent not found" }, 404)
		}
		const card = await buildAgentCardForConfig(pool, config)
		return c.json(card)
	})

	router.post("/agents/:configId", async (c) => {
		const configId = c.req.param("configId")
		const config = await agentConfigQueries.getAgentConfig(pool, configId)
		if (!config) {
			return c.json(
				{ jsonrpc: "2.0", id: null, error: { code: JSONRPCErrorCode.InvalidParams, message: "Agent not found" } },
				404,
			)
		}

		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return c.json(
				{ jsonrpc: "2.0", id: null, error: { code: JSONRPCErrorCode.ParseError, message: "Parse error" } },
				400,
			)
		}

		if (typeof body !== "object" || body === null) {
			return c.json(
				{ jsonrpc: "2.0", id: null, error: { code: JSONRPCErrorCode.InvalidRequest, message: "Request must be a JSON object" } },
				400,
			)
		}

		const req = body as Partial<JSONRPCRequest>
		if (req.jsonrpc !== "2.0") {
			return c.json(
				{ jsonrpc: "2.0", id: req.id ?? null, error: { code: JSONRPCErrorCode.InvalidRequest, message: 'jsonrpc must be "2.0"' } },
				400,
			)
		}

		const rpcId = req.id ?? null

		if (typeof req.method !== "string") {
			return c.json(
				{ jsonrpc: "2.0", id: rpcId, error: { code: JSONRPCErrorCode.InvalidRequest, message: "method must be a string" } },
				400,
			)
		}

		const { requestHandler } = getOrCreateHandler(handlers, configId, config, sessionProvider)
		const rpcRequest = body as JSONRPCRequest

		switch (req.method) {
			case "tasks/send":
			case "message/send": {
				const response = await requestHandler.onMessageSend(rpcRequest as unknown as SendMessageRequest)
				return c.json(response)
			}

			case "tasks/sendSubscribe":
			case "message/sendStream": {
				return streamSSE(c, async (stream) => {
					const gen = requestHandler.onMessageSendStream(rpcRequest as unknown as SendMessageStreamingRequest)
					for await (const chunk of gen) {
						if (stream.aborted) break
						await stream.writeSSE({ data: JSON.stringify(chunk) })
					}
				})
			}

			case "tasks/get": {
				const response = await requestHandler.onGetTask(rpcRequest as Parameters<typeof requestHandler.onGetTask>[0])
				return c.json(response)
			}

			case "tasks/cancel": {
				const response = await requestHandler.onCancelTask(rpcRequest as unknown as CancelTaskRequest)
				return c.json(response)
			}

			default:
				return c.json(
					{ jsonrpc: "2.0", id: rpcId, error: { code: JSONRPCErrorCode.MethodNotFound, message: `Method not found: ${req.method}` } },
					404,
				)
		}
	})

	return router
}
