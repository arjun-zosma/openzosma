/** Event types emitted by an agent during a turn. */
export type AgentStreamEventType =
	// Lifecycle
	| "turn_start"
	| "turn_end"
	// Assistant message streaming
	| "message_start"
	| "message_update"
	| "message_end"
	// Tool execution
	| "tool_call_start"
	| "tool_call_update"
	| "tool_call_end"
	// Thinking / reasoning
	| "thinking_update"
	// Error
	| "error"

/** A single event in the agent response stream. */
export interface AgentStreamEvent {
	type: AgentStreamEventType
	/** Event or turn ID. */
	id?: string
	/** Text delta (for message_update / thinking_update). */
	text?: string
	/** Error message (for error events). */
	error?: string
	/** Tool name (for tool_call_* events). */
	toolName?: string
	/** Tool call ID (for tool_call_* events). */
	toolCallId?: string
	/** Tool arguments as JSON string (for tool_call_start). */
	toolArgs?: string
	/** Tool result text (for tool_call_end). */
	toolResult?: string
	/** Whether the tool execution errored (for tool_call_end). */
	isToolError?: boolean
}

/** A stored message within an agent session. */
export interface AgentMessage {
	id: string
	role: "user" | "assistant"
	content: string
	createdAt: string
}

/** Options for creating an agent session. */
export interface AgentSessionOpts {
	sessionId: string
	workspaceDir: string
	/**
	 * Stable directory for long-term memory that persists across sessions.
	 * When omitted, defaults to workspaceDir (memory is per-session and lost on
	 * new conversations). Should point to a directory shared by all sessions
	 * belonging to the same agent configuration.
	 */
	memoryDir?: string
	/**
	 * LLM provider name (e.g. "anthropic", "openai").
	 * When omitted, resolved from environment variables.
	 */
	provider?: string
	/**
	 * Model ID within the provider (e.g. "claude-sonnet-4-20250514").
	 * When omitted, the provider default is used.
	 */
	model?: string
	/**
	 * Base URL for an OpenAI-compatible endpoint (e.g. "http://localhost:11434/v1").
	 * When set together with `model`, creates a custom model targeting this URL
	 * instead of looking up the model in the pi-ai registry.
	 */
	baseUrl?: string
	/**
	 * System prompt override. When omitted, the built-in default is used.
	 */
	systemPrompt?: string
	/**
	 * Subset of tool names to enable (e.g. ["read", "bash", "write"]).
	 * Valid names: read, bash, edit, write, grep, find, ls.
	 * When omitted or empty, all tools are enabled.
	 */
	toolsEnabled?: string[]
}

/** A single agent session that can exchange messages. */
export interface AgentSession {
	/** Send a user message and stream back events. */
	sendMessage(content: string, signal?: AbortSignal): AsyncGenerator<AgentStreamEvent>
	/** Get all messages in this session. */
	getMessages(): AgentMessage[]
}

/** Provider that creates agent sessions. */
export interface AgentProvider {
	/** Unique identifier for this provider (e.g. "pi-coding"). */
	readonly id: string
	/** Human-readable name (e.g. "Pi Coding Agent"). */
	readonly name: string
	/** Create a new session backed by this provider. */
	createSession(opts: AgentSessionOpts): AgentSession
}
