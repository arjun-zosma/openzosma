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

// ---------------------------------------------------------------------------
// Knowledge base types
// ---------------------------------------------------------------------------

/** A single file in the knowledge base. */
export interface KBFileEntry {
	/** Relative path within .knowledge-base/ */
	path: string
	/** UTF-8 file content */
	content: string
	/** File size in bytes */
	sizeBytes: number
	/** ISO 8601 last modified timestamp */
	modifiedAt: string
}

/** Response for GET /kb */
export interface KBListResponse {
	files: KBFileEntry[]
}
