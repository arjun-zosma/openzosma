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
	/**
	 * Text to prepend to the system prompt. Used by channel adapters
	 * (e.g. Slack) to inject adapter-specific instructions without
	 * replacing the full system prompt.
	 */
	systemPromptPrefix?: string
	/** Subset of tools to enable. */
	toolsEnabled?: string[]
	/** Agent config ID (for reference). */
	agentConfigId?: string
	/** Host memory directory path for persistence. */
	memoryDir?: string
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

// ---------------------------------------------------------------------------
// User files types
// ---------------------------------------------------------------------------

/** A single entry (file or folder) in the user files area. */
export interface UserFileEntry {
	/** File or folder name. */
	name: string
	/** Relative path from the user-files root. */
	path: string
	/** True if this entry is a directory. */
	isFolder: boolean
	/** MIME type (null for folders). */
	mimeType: string | null
	/** Size in bytes (0 for folders). */
	sizeBytes: number
	/** ISO 8601 last modified timestamp. */
	modifiedAt: string
	/** Child entries (only present for folders in tree responses). */
	children?: UserFileEntry[]
}
