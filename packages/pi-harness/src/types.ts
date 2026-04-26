/**
 * Types for the pi-harness standalone agent server.
 */

export interface CreateSessionRequest {
	/** Optional session ID (UUID generated if omitted) */
	sessionId?: string
	/** LLM provider identifier */
	provider?: string
	/** Model identifier */
	model?: string
	/** Optional system prompt override */
	systemPrompt?: string
	/** Optional prefix prepended to the system prompt */
	systemPromptPrefix?: string
	/** Optional suffix appended to the system prompt */
	systemPromptSuffix?: string
	/** Tool names to enable (omit for all) */
	toolsEnabled?: string[]
	/** Workspace directory for this session */
	workspaceDir?: string
}

export interface SendMessageRequest {
	/** User message content */
	content: string
}

export interface SessionResponse {
	sessionId: string
	status: "active" | "ended"
	createdAt: string
}

export interface HealthResponse {
	status: "ok"
	sessions: number
	uptime: number
	version: string
}

export interface ErrorResponse {
	error: string
}
