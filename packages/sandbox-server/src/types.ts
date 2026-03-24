import type { AgentStreamEvent } from "@openzosma/agents"

/** Request body for POST /sessions */
export interface CreateSessionRequest {
	/** Optional session ID. Auto-generated if not provided. */
	sessionId?: string
	/** LLM provider name override. */
	provider?: string
	/** Model ID override. */
	model?: string
	/** System prompt override. */
	systemPrompt?: string
	/** Subset of tools to enable. */
	toolsEnabled?: string[]
	/** Agent config ID (for reference). */
	agentConfigId?: string
}

/** Response for POST /sessions */
export interface CreateSessionResponse {
	sessionId: string
}

/** Request body for POST /sessions/:id/messages */
export interface SendMessageRequest {
	content: string
}

/** Re-export for convenience. */
export type { AgentStreamEvent }
