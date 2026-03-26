import { createLogger } from "@openzosma/logger"
import type { SessionManager } from "./session-manager.js"

const log = createLogger({ component: "gateway" })

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
 * Config shape expected by SlackAdapter constructor.
 * Duplicated here to avoid a package dependency on @openzosma/adapter-slack
 * (which would create a circular workspace dependency).
 */
interface SlackAdapterConfig {
	botToken: string
	appToken?: string
}

/**
 * Initialize all configured channel adapters at gateway startup.
 * Adapters are enabled by the presence of their required env vars.
 */
export const initAdapters = async (sessionManager: SessionManager): Promise<ChannelAdapter[]> => {
	const adapters: ChannelAdapter[] = []

	if (process.env.SLACK_BOT_TOKEN) {
		// Dynamic import: adapter-slack is an optional package. We avoid listing
		// it as a dependency to prevent a circular build edge (adapter-slack
		// depends on gateway for types). The cast provides type safety without
		// requiring TS module resolution.
		const mod = (await import(/* webpackIgnore: true */ "@openzosma/adapter-slack" as string)) as {
			SlackAdapter: new (config: SlackAdapterConfig) => ChannelAdapter
		}
		adapters.push(
			new mod.SlackAdapter({
				botToken: process.env.SLACK_BOT_TOKEN,
				appToken: process.env.SLACK_APP_TOKEN,
			}),
		)
	}

	for (const adapter of adapters) {
		await adapter.init(sessionManager)
		log.info(`Adapter started: ${adapter.name}`)
	}

	return adapters
}
