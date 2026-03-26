import type { SessionManager } from "./session-manager.js"

/**
 * Common contract for all channel adapters (Slack, WhatsApp, etc.).
 *
 * Adapters are lightweight translators: they receive inbound messages from
 * an external platform, map them to orchestrator sessions, and stream
 * agent responses back to the platform. They contain no business logic.
 */
export interface ChannelAdapter {
	/** Human-readable adapter name used in logs. */
	readonly name: string
	/** Start the adapter (connect to platform, register event handlers). */
	init(sessionManager: SessionManager): Promise<void>
	/** Gracefully disconnect and release resources. */
	shutdown(): Promise<void>
}

/**
 * Initialize all configured channel adapters at gateway startup.
 * Adapters are enabled by the presence of their required env vars.
 */
export async function initAdapters(sessionManager: SessionManager): Promise<ChannelAdapter[]> {
	const adapters: ChannelAdapter[] = []

	if (process.env.SLACK_BOT_TOKEN) {
		const { SlackAdapter } = await import("@openzosma/adapter-slack")
		adapters.push(
			new SlackAdapter({
				botToken: process.env.SLACK_BOT_TOKEN,
				appToken: process.env.SLACK_APP_TOKEN,
			}),
		)
	}

	for (const adapter of adapters) {
		await adapter.init(sessionManager)
		console.log(`Adapter started: ${adapter.name}`)
	}

	return adapters
}
