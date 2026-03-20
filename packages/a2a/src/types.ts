/**
 * Abstract session provider that the A2A executor delegates to.
 *
 * The gateway's `SessionManager` implements this interface, but any
 * package that needs to bridge A2A requests to an agent backend can
 * supply its own implementation.
 */
export interface A2ASessionProvider {
	createSession(
		id: string,
		agentConfigId: string,
		resolvedConfig: {
			provider: string
			model: string
			systemPrompt: string | null
			toolsEnabled: string[]
		},
	): Promise<{ id: string }>

	sendMessage(
		sessionId: string,
		content: string,
		signal?: AbortSignal,
	): AsyncGenerator<{ type: string; text?: string }>
}
