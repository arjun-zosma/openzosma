import type { AgentStreamEvent } from "@openzosma/agents"
import type {
	SandboxCreateSessionRequest,
	SandboxCreateSessionResponse,
	SandboxHealthResponse,
	SandboxSessionInfo,
	SandboxSessionListResponse,
} from "./types.js"

/** Default request timeout (30s). */
const DEFAULT_TIMEOUT_MS = 30_000

/**
 * HTTP client for communicating with the sandbox-server running inside
 * an OpenShell sandbox. Uses native fetch().
 *
 * Initially the orchestrator reaches the sandbox via `openshell exec curl`,
 * but once we have pod IP connectivity this client calls the sandbox
 * directly over HTTP.
 */
export class SandboxHttpClient {
	private readonly baseUrl: string
	private readonly timeoutMs: number

	constructor(host: string, port: number, opts?: { timeoutMs?: number }) {
		this.baseUrl = `http://${host}:${port}`
		this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
	}

	// -----------------------------------------------------------------------
	// Health
	// -----------------------------------------------------------------------

	async health(): Promise<SandboxHealthResponse> {
		const res = await this.fetch("/health")
		return res.json() as Promise<SandboxHealthResponse>
	}

	async isHealthy(): Promise<boolean> {
		try {
			const h = await this.health()
			return h.status === "ok"
		} catch {
			return false
		}
	}

	// -----------------------------------------------------------------------
	// Sessions
	// -----------------------------------------------------------------------

	async createSession(req: SandboxCreateSessionRequest): Promise<SandboxCreateSessionResponse> {
		const res = await this.fetch("/sessions", {
			method: "POST",
			body: JSON.stringify(req),
		})
		if (!res.ok) {
			let detail: string
			try {
				const body = (await res.json()) as { error?: string }
				detail = body.error ?? `HTTP ${res.status}`
			} catch {
				detail = await res.text().catch(() => `HTTP ${res.status}`)
			}
			throw new Error(`Sandbox createSession failed (${res.status}): ${detail}`)
		}
		return res.json() as Promise<SandboxCreateSessionResponse>
	}

	async getSession(sessionId: string): Promise<SandboxSessionInfo | null> {
		try {
			const res = await this.fetch(`/sessions/${sessionId}`)
			if (res.status === 404) return null
			return res.json() as Promise<SandboxSessionInfo>
		} catch {
			return null
		}
	}

	async deleteSession(sessionId: string): Promise<boolean> {
		try {
			const res = await this.fetch(`/sessions/${sessionId}`, { method: "DELETE" })
			return res.ok
		} catch {
			return false
		}
	}

	async listSessions(): Promise<string[]> {
		const res = await this.fetch("/sessions")
		const body = (await res.json()) as SandboxSessionListResponse
		return body.sessions
	}

	// -----------------------------------------------------------------------
	// Message streaming (SSE)
	// -----------------------------------------------------------------------

	/**
	 * Send a message to a session and stream back agent events via SSE.
	 *
	 * The sandbox-server returns a standard SSE stream where each event
	 * is a JSON-encoded AgentStreamEvent.
	 */
	async *sendMessage(sessionId: string, content: string, signal?: AbortSignal): AsyncGenerator<AgentStreamEvent> {
		const res = await this.fetch(`/sessions/${sessionId}/messages`, {
			method: "POST",
			body: JSON.stringify({ content }),
			signal,
			// Don't use the default timeout for streaming responses
			timeout: 0,
		})

		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Sandbox message request failed (${res.status}): ${text}`)
		}

		const body = res.body
		if (!body) {
			throw new Error("No response body from sandbox-server")
		}

		yield* this.parseSSE(body, signal)
	}

	async cancelSession(sessionId: string): Promise<boolean> {
		try {
			const res = await this.fetch(`/sessions/${sessionId}/cancel`, { method: "POST" })
			return res.ok
		} catch {
			return false
		}
	}

	// -----------------------------------------------------------------------
	// SSE parser
	// -----------------------------------------------------------------------

	private async *parseSSE(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<AgentStreamEvent> {
		const reader = body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""

		try {
			while (true) {
				if (signal?.aborted) break

				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split("\n")

				// Keep the last incomplete line in the buffer
				buffer = lines.pop() ?? ""

				let currentData = ""

				for (const line of lines) {
					if (line.startsWith("data:")) {
						currentData += line.slice(5).trimStart()
					} else if (line.trim() === "" && currentData) {
						// Empty line = end of event
						try {
							const event = JSON.parse(currentData) as AgentStreamEvent
							yield event
						} catch {
							// Skip malformed events
						}
						currentData = ""
					}
				}
			}
		} finally {
			reader.releaseLock()
		}
	}

	// -----------------------------------------------------------------------
	// Internal fetch wrapper
	// -----------------------------------------------------------------------

	private async fetch(
		path: string,
		opts?: { method?: string; body?: string; signal?: AbortSignal; timeout?: number },
	): Promise<Response> {
		const url = this.baseUrl + path
		const timeout = opts?.timeout ?? this.timeoutMs

		let signal = opts?.signal
		let timeoutId: ReturnType<typeof setTimeout> | undefined

		// Create a timeout signal if no external signal and timeout > 0
		if (!signal && timeout > 0) {
			const controller = new AbortController()
			signal = controller.signal
			timeoutId = setTimeout(() => controller.abort(), timeout)
		}

		try {
			const res = await fetch(url, {
				method: opts?.method ?? "GET",
				headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
				body: opts?.body,
				signal,
			})
			return res
		} finally {
			if (timeoutId !== undefined) {
				clearTimeout(timeoutId)
			}
		}
	}
}
