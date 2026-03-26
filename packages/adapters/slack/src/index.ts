import type { ChannelAdapter } from "@openzosma/gateway/adapters"
import type { SessionManager } from "@openzosma/gateway/session-manager"
import type { GatewayEvent } from "@openzosma/gateway/types"
import { type AllMiddlewareArgs, App, type SlackEventMiddlewareArgs } from "@slack/bolt"

export interface SlackAdapterConfig {
	botToken: string
	appToken?: string
}

type MessageEvent = SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs

/**
 * Slack channel adapter using Bolt's Socket Mode.
 *
 * Maps Slack threads (channel + thread_ts) to orchestrator sessions and
 * streams agent responses back as threaded replies.
 */
export class SlackAdapter implements ChannelAdapter {
	readonly name = "slack"
	private app: App
	private sessionManager: SessionManager | undefined
	private sessionMap = new Map<string, string>()

	constructor(config: SlackAdapterConfig) {
		this.app = new App({
			token: config.botToken,
			appToken: config.appToken,
			socketMode: Boolean(config.appToken),
		})
	}

	async init(sessionManager: SessionManager): Promise<void> {
		this.sessionManager = sessionManager
		this.app.message(this.handleMessage.bind(this))
		await this.app.start()
	}

	async shutdown(): Promise<void> {
		await this.app.stop()
	}

	private threadKey(channel: string, threadTs: string): string {
		return `slack:${channel}:${threadTs}`
	}

	private async getOrCreateSession(channel: string, threadTs: string): Promise<string> {
		const key = this.threadKey(channel, threadTs)
		const existing = this.sessionMap.get(key)
		if (existing) return existing

		const session = await this.sessionManager!.createSession()
		this.sessionMap.set(key, session.id)
		return session.id
	}

	private async handleMessage({ message, say }: MessageEvent): Promise<void> {
		if (!this.sessionManager) return
		if (!("text" in message) || !message.text) return
		if ("bot_id" in message) return

		const channel = message.channel
		const threadTs = ("thread_ts" in message ? message.thread_ts : message.ts) ?? message.ts
		const userText = message.text

		const sessionId = await this.getOrCreateSession(channel, threadTs)

		const controller = new AbortController()
		const events = this.sessionManager.sendMessage(sessionId, userText, controller.signal)

		let fullResponse = ""

		for await (const event of events) {
			const typed = event as GatewayEvent
			if (typed.type === "message_update" && typed.text) {
				fullResponse += typed.text
			}
			if (typed.type === "error") {
				await say({ text: `Error: ${typed.error ?? "unknown error"}`, thread_ts: threadTs })
				return
			}
		}

		if (fullResponse) {
			await say({ text: fullResponse, thread_ts: threadTs })
		}
	}
}
