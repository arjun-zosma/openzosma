import { createLogger } from "@openzosma/logger"
import type { AllMiddlewareArgs, SayFn, SlackEventMiddlewareArgs } from "@slack/bolt"
import { App } from "@slack/bolt"
import type {
	AdapterGatewayEvent,
	AdapterSessionManager,
	SlackChannelInfo,
	SlackMessageContext,
	SlackThreadMessage,
	SlackUserProfile,
} from "./types.js"

const log = createLogger({ component: "slack-adapter" })

/**
 * Maximum time (ms) to wait for the agent to finish a turn.
 * Defaults to 120 seconds. Set SLACK_TURN_TIMEOUT_MS=0 to disable.
 */
const SLACK_TURN_TIMEOUT_MS = Number(process.env.SLACK_TURN_TIMEOUT_MS) || 120_000

/** Maximum number of thread messages to include in context. */
const MAX_THREAD_HISTORY = 50

/** Maximum characters per thread message in context. */
const MAX_MESSAGE_LENGTH = 500

/**
 * System prompt prefix injected into every Slack-originated session.
 *
 * Gives the agent baseline Slack-aware behaviour: understanding the
 * context block format, knowing how to address users, respecting
 * Slack formatting conventions, and understanding its communication
 * channel. Also teaches the agent how to use the agent-slack CLI
 * to actively query Slack (channel members, search, etc.).
 */
const SLACK_SYSTEM_PROMPT_PREFIX = `<role>You are communicating with users through Slack.</role>

<slack-context-format>
Each message you receive will be prefixed with a <slack-context> block containing:
- The sender's name, email, and job title
- The channel name and topic (or "Direct Message" for DMs)
- Previous messages in the thread for conversational context
</slack-context-format>

<guidelines>
- Address users by their first name (extracted from the <slack-context> block).
- Keep responses concise and well-structured. Use Slack-compatible markdown (bold with *text*, code with \`code\`, code blocks with \`\`\`).
- Do not repeat information from the <slack-context> block back to the user.
- When referencing thread history, be natural about it -- do not say "I see from the thread history that...".
- You are a helpful AI assistant. Be direct, professional, and technically accurate.
</guidelines>

<tool name="agent-slack">
<description>You have the \`agent-slack\` CLI available on PATH. It is pre-authenticated via the SLACK_TOKEN environment variable. Use it via the bash tool when you need to actively query Slack for information not in the <slack-context> block.</description>

<when-to-use>
- Listing channel members or looking up users
- Searching messages or files across channels
- Reading recent channel history beyond the current thread
- Looking up user profiles or details
- Any Slack query the user asks about that is not already in the <slack-context> block
</when-to-use>

<commands title="List channel members and user info">
  agent-slack user list --limit 100
  agent-slack user get "@username"
</commands>

<commands title="Browse recent channel messages">
  agent-slack message list "general" --limit 20
  agent-slack message list "C0123ABC" --limit 10
</commands>

<commands title="Search messages">
  agent-slack search messages "search query" --channel "general"
  agent-slack search all "query" --channel "alerts" --after 2026-01-01
</commands>

<commands title="List channels">
  agent-slack channel list
  agent-slack channel list --all --limit 100
</commands>

<commands title="Get a specific message or thread">
  agent-slack message get "https://workspace.slack.com/archives/C123/p1700000000000000"
  agent-slack message list "https://workspace.slack.com/archives/C123/p1700000000000000"
</commands>

<commands title="Send files to the current Slack channel/thread">
  agent-slack message send "&lt;Channel_ID&gt;" "optional message" --attach /path/to/file
  agent-slack message send "&lt;Channel_ID&gt;" --attach ./report.pdf --attach ./chart.png
</commands>
<file-upload-notes>
- Use the Channel ID from the <slack-context> block above.
- For threaded replies, add --thread-ts "&lt;Thread&gt;" using the Thread value from the context block.
- Maximum file size: 100 MB.
- Use multiple --attach flags to upload multiple files at once.
</file-upload-notes>

<rules>
- Output is JSON. Use \`| jq '.field'\` for filtering if needed.
- Do NOT use python3 for post-processing, only jq.
- Run each agent-slack command as a separate bash call (no && chains).
- Use channel names without the # prefix (e.g. "general" not "#general").
- Only use flags documented here or in the skill file. Do NOT invent flags -- run \`agent-slack &lt;command&gt; --help\` if unsure.
- \`user list\` lists ALL workspace users. It has NO \`--channel\` flag.
</rules>

<advanced>For advanced commands, full flag reference, and additional examples, read the skill file at \`/app/skills/agent-slack.md\`.</advanced>
</tool>`

// ─── Inlined types (originally from @openzosma/gateway) ──────────────────────
// These are duplicated here to avoid a circular workspace dependency:
// adapter-slack → gateway → adapter-slack.

interface ChannelAdapter {
	readonly name: string
	init(sessionManager: SlackSessionManager): Promise<void>
	shutdown(): Promise<void>
}

interface SlackSessionManager {
	createSession(userId?: string, agentConfigId?: string): Promise<{ id: string }>
	sendMessage(sessionId: string, content: string, signal?: AbortSignal): AsyncIterable<SlackGatewayEvent>
}

interface SlackGatewayEvent {
	type: string
	text?: string
	error?: string
}

// ─────────────────────────────────────────────────────────────────────────────

export interface SlackAdapterConfig {
	botToken: string
	appToken?: string
}

type MessageEvent = SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs

/** A queued message waiting to be processed. */
interface QueuedMessage {
	sessionId: string
	userId: string
	/** The enriched message text (context block + original text). */
	text: string
	threadTs: string
	say: SayFn
}

// ---------------------------------------------------------------------------
// Context formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a Slack timestamp (Unix epoch with microseconds) into a
 * human-readable time string.
 */
const formatTimestamp = (ts: string): string => {
	try {
		const seconds = Number.parseFloat(ts)
		const date = new Date(seconds * 1000)
		return date.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		})
	} catch {
		return ts
	}
}

/**
 * Build a structured XML context block that gets prepended to the user's
 * message before sending to the agent. This gives the agent awareness
 * of who is talking, what channel they are in, and the thread history.
 *
 * Uses XML tags so the LLM can unambiguously parse context boundaries
 * regardless of whether message content contains markdown.
 */
const buildContextBlock = (context: SlackMessageContext): string => {
	const lines: string[] = ["<slack-context>"]

	lines.push(
		`<sender name="${escapeXml(context.sender.realName)}"${context.sender.email ? ` email="${escapeXml(context.sender.email)}"` : ""}${context.sender.title ? ` title="${escapeXml(context.sender.title)}"` : ""} />`,
	)

	if (context.channel.isDm) {
		lines.push(`<channel id="${escapeXml(context.channel.channelId)}" type="dm" />`)
	} else {
		lines.push(
			`<channel name="${escapeXml(context.channel.name)}" id="${escapeXml(context.channel.channelId)}" type="channel">`,
		)
		if (context.channel.topic) {
			lines.push(`<topic>${escapeXml(context.channel.topic)}</topic>`)
		}
		lines.push("</channel>")
	}

	if (context.threadTs) {
		lines.push(`<thread ts="${escapeXml(context.threadTs)}">`)
	} else {
		lines.push("<thread>")
	}

	if (context.threadHistory.length > 0) {
		lines.push(`<history count="${context.threadHistory.length}">`)
		for (const msg of context.threadHistory) {
			const time = formatTimestamp(msg.ts)
			const senderAttr = msg.isBot
				? `sender="${escapeXml(msg.senderName)}" bot="true"`
				: `sender="${escapeXml(msg.senderName)}"`
			const text = msg.text.length > MAX_MESSAGE_LENGTH ? `${msg.text.slice(0, MAX_MESSAGE_LENGTH - 3)}...` : msg.text
			lines.push(`<message time="${escapeXml(time)}" ${senderAttr}>${escapeXml(text)}</message>`)
		}
		lines.push("</history>")
	}

	lines.push("</thread>")
	lines.push("</slack-context>")
	return lines.join("\n")
}

const escapeXml = (str: string): string =>
	str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * Slack channel adapter using Bolt's Socket Mode.
 *
 * Maps Slack threads (channel + thread_ts) to orchestrator sessions and
 * streams agent responses back as threaded replies. Resolves Slack users
 * to OpenZosma users by matching email addresses.
 *
 * Messages are processed sequentially per session -- if a message arrives
 * while the agent is still handling a previous one, it is queued and
 * processed after the current turn completes.
 *
 * Each message is enriched with a <slack-context> block containing:
 * - The sender's name, email, and title
 * - The channel name and topic
 * - Previous messages in the thread
 */
export class SlackAdapter implements ChannelAdapter {
	readonly name = "slack"
	private app: App
	private sessionManager: AdapterSessionManager | undefined
	private sessionMap = new Map<string, string>()

	/** Per-session message queues. Key is the orchestrator session ID. */
	private messageQueues = new Map<string, QueuedMessage[]>()
	/** Sessions currently being processed. */
	private activeSessions = new Set<string>()

	/** Cache of Slack user profiles to avoid repeated API calls. */
	private userProfileCache = new Map<string, SlackUserProfile>()

	constructor(config: SlackAdapterConfig) {
		this.app = new App({
			token: config.botToken,
			appToken: config.appToken,
			socketMode: Boolean(config.appToken),
		})
	}

	async init(sessionManager: AdapterSessionManager): Promise<void> {
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

	// -----------------------------------------------------------------------
	// User profile fetching and caching
	// -----------------------------------------------------------------------

	/**
	 * Fetch a Slack user's profile, returning a cached copy if available.
	 * Populates the cache on first fetch to avoid repeated API calls
	 * for the same user across messages and thread history resolution.
	 */
	private async fetchUserProfile(slackUserId: string): Promise<SlackUserProfile | null> {
		const cached = this.userProfileCache.get(slackUserId)
		if (cached) return cached

		try {
			const result = await this.app.client.users.info({ user: slackUserId })
			const user = result.user
			if (!user) return null

			const profile: SlackUserProfile = {
				slackUserId,
				displayName: user.profile?.display_name || user.profile?.real_name || user.name || slackUserId,
				realName: user.profile?.real_name || user.name || slackUserId,
				email: user.profile?.email,
				title: user.profile?.title || undefined,
				timezone: user.tz || undefined,
			}
			this.userProfileCache.set(slackUserId, profile)
			return profile
		} catch (err) {
			log.error("Failed to fetch Slack user profile", {
				slackUserId,
				error: err instanceof Error ? err.message : String(err),
			})
			return null
		}
	}

	/**
	 * Resolve a Slack user ID to an OpenZosma user ID by matching emails.
	 * Returns null if the Slack user has no email or no matching OpenZosma
	 * account exists.
	 */
	private async resolveUserId(slackUserId: string): Promise<string | null> {
		if (!this.sessionManager) return null

		const profile = await this.fetchUserProfile(slackUserId)
		if (!profile?.email) {
			log.warn("Slack user has no email in profile", { slackUserId })
			return null
		}

		try {
			const userId = await this.sessionManager.resolveUserByEmail(profile.email)
			if (userId) {
				log.info("Resolved Slack user to OpenZosma account", {
					slackUserId,
					email: profile.email,
					userId,
				})
			} else {
				log.warn("No OpenZosma account found for Slack user email", {
					slackUserId,
					email: profile.email,
				})
			}
			return userId
		} catch (err) {
			log.error("Failed to resolve Slack user", {
				slackUserId,
				error: err instanceof Error ? err.message : String(err),
			})
			return null
		}
	}

	// -----------------------------------------------------------------------
	// Slack context fetching
	// -----------------------------------------------------------------------

	/**
	 * Fetch metadata about a Slack channel (name, topic, purpose, type).
	 */
	private async fetchChannelInfo(channelId: string): Promise<SlackChannelInfo | null> {
		try {
			const result = await this.app.client.conversations.info({ channel: channelId })
			const ch = result.channel
			if (!ch) return null

			// For DMs, try to build a readable name from the other participant.
			// The Slack API returns a `user` field on IM channels at runtime,
			// but the @slack/web-api type definition omits it.
			let name = ch.name ?? channelId
			const isDm = Boolean(ch.is_im || ch.is_mpim)
			const imUser = (ch as Record<string, unknown>).user as string | undefined

			if (ch.is_im && imUser) {
				const otherProfile = await this.fetchUserProfile(imUser)
				if (otherProfile) {
					name = otherProfile.displayName
				}
			}

			return {
				channelId,
				name,
				topic: ch.topic?.value || undefined,
				purpose: ch.purpose?.value || undefined,
				isDm,
			}
		} catch (err) {
			log.warn("Failed to fetch channel info", {
				channelId,
				error: err instanceof Error ? err.message : String(err),
			})
			return null
		}
	}

	/**
	 * Fetch the message history of a Slack thread. Returns all messages
	 * in chronological order, excluding the current message (identified
	 * by `currentTs`).
	 *
	 * Resolves user names for each message using the profile cache.
	 */
	private async fetchThreadHistory(
		channel: string,
		threadTs: string,
		currentTs: string,
	): Promise<SlackThreadMessage[]> {
		try {
			const result = await this.app.client.conversations.replies({
				channel,
				ts: threadTs,
				limit: MAX_THREAD_HISTORY,
			})

			const messages = result.messages ?? []
			const threadMessages: SlackThreadMessage[] = []

			for (const msg of messages) {
				// Skip the current message being processed
				if (msg.ts === currentTs) continue

				let senderName = "Unknown"
				let isBot = false

				// The Slack API returns `subtype` and `username` on messages at
				// runtime, but the @slack/web-api MessageElement type omits them.
				const msgRecord = msg as Record<string, unknown>
				const msgSubtype = msgRecord.subtype as string | undefined
				const msgUsername = msgRecord.username as string | undefined

				if (msg.bot_id || msgSubtype === "bot_message") {
					senderName = msgUsername ?? "Bot"
					isBot = true
				} else if (msg.user) {
					const profile = await this.fetchUserProfile(msg.user)
					senderName = profile?.displayName ?? msg.user
				}

				threadMessages.push({
					senderName,
					isBot,
					text: msg.text ?? "",
					ts: msg.ts ?? "",
				})
			}

			return threadMessages
		} catch (err) {
			log.warn("Failed to fetch thread history", {
				channel,
				threadTs,
				error: err instanceof Error ? err.message : String(err),
			})
			return []
		}
	}

	/**
	 * Build the full Slack context for a message: sender profile, channel
	 * info, and thread history. Then format as a context block string.
	 *
	 * Returns the context block to prepend to the message, or an empty
	 * string if context could not be fetched.
	 */
	private async buildMessageContext(
		slackUserId: string,
		channel: string,
		threadTs: string,
		currentTs: string,
	): Promise<string> {
		// Fetch all context in parallel where possible
		const [senderProfile, channelInfo] = await Promise.all([
			this.fetchUserProfile(slackUserId),
			this.fetchChannelInfo(channel),
		])

		if (!senderProfile) {
			log.warn("Could not build context: sender profile unavailable", { slackUserId })
			return ""
		}

		// Thread history requires sequential user lookups (cached), so fetch after
		const threadHistory = await this.fetchThreadHistory(channel, threadTs, currentTs)

		const context: SlackMessageContext = {
			sender: senderProfile,
			channel: channelInfo ?? {
				channelId: channel,
				name: channel,
				isDm: false,
			},
			threadHistory,
			threadTs,
		}

		return buildContextBlock(context)
	}

	// -----------------------------------------------------------------------
	// Session management
	// -----------------------------------------------------------------------

	private async getOrCreateSession(channel: string, threadTs: string, userId: string): Promise<string> {
		const key = this.threadKey(channel, threadTs)
		const existing = this.sessionMap.get(key)
		if (existing) {
			log.debug("Reusing existing session", { key, sessionId: existing })
			return existing
		}

		const session = await this.sessionManager!.createSession(
			undefined,
			undefined,
			{ systemPromptPrefix: SLACK_SYSTEM_PROMPT_PREFIX },
			userId,
		)
		this.sessionMap.set(key, session.id)
		log.info("Created new session for Slack thread", { key, sessionId: session.id, userId })
		return session.id
	}

	// -----------------------------------------------------------------------
	// Message processing
	// -----------------------------------------------------------------------

	/**
	 * Build an AbortSignal that fires on the given timeout (if > 0).
	 * Returns undefined if SLACK_TURN_TIMEOUT_MS is 0 (no timeout).
	 */
	private buildSignal(): { signal: AbortSignal; cleanup: () => void } | undefined {
		if (SLACK_TURN_TIMEOUT_MS <= 0) return undefined

		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), SLACK_TURN_TIMEOUT_MS)
		return {
			signal: controller.signal,
			cleanup: () => clearTimeout(timer),
		}
	}

	/**
	 * Process a single message: send to the agent and post the reply.
	 * Called sequentially per session by the queue drainer.
	 */
	private async processMessage(msg: QueuedMessage): Promise<void> {
		if (!this.sessionManager) return

		const startTime = Date.now()
		log.info("Processing message", {
			sessionId: msg.sessionId,
			userId: msg.userId,
			textLength: msg.text.length,
			threadTs: msg.threadTs,
		})

		const timeout = this.buildSignal()

		try {
			const events = this.sessionManager.sendMessage(msg.sessionId, msg.text, timeout?.signal, msg.userId)

			let fullResponse = ""
			let eventCount = 0

			for await (const event of events) {
				const typed = event as AdapterGatewayEvent
				eventCount++

				if (typed.type === "message_update" && typed.text) {
					fullResponse += typed.text
				}
				if (typed.type === "error") {
					log.error("Agent returned error event", {
						sessionId: msg.sessionId,
						error: typed.error,
						eventCount,
						durationMs: Date.now() - startTime,
					})
					await msg.say({ text: `Error: ${typed.error ?? "unknown error"}`, thread_ts: msg.threadTs })
					return
				}
			}

			const durationMs = Date.now() - startTime

			// Check if we exited because the timeout fired. The orchestrator
			// catches the AbortError and silently returns (no exception), so
			// the for-await completes normally with an empty response. We need
			// to detect this and inform the user.
			if (timeout?.signal.aborted) {
				log.warn("Turn timed out", {
					sessionId: msg.sessionId,
					timeoutMs: SLACK_TURN_TIMEOUT_MS,
					durationMs,
					eventCount,
					partialResponseLength: fullResponse.length,
				})
				await msg.say({
					text: fullResponse || "The response took too long and was cancelled. Try a simpler request.",
					thread_ts: msg.threadTs,
				})
				return
			}

			log.info("Message processing complete", {
				sessionId: msg.sessionId,
				eventCount,
				responseLength: fullResponse.length,
				durationMs,
			})

			if (fullResponse) {
				await msg.say({ text: fullResponse, thread_ts: msg.threadTs })
			} else {
				log.warn("Agent returned no response text", { sessionId: msg.sessionId, eventCount, durationMs })
				await msg.say({
					text: "I was unable to generate a response. Please try again.",
					thread_ts: msg.threadTs,
				})
			}
		} catch (err) {
			const durationMs = Date.now() - startTime

			// Check if this was our timeout firing (exception path -- can happen
			// if a layer propagates the AbortError instead of catching it)
			if (timeout?.signal.aborted) {
				log.warn("Turn timed out (exception path)", {
					sessionId: msg.sessionId,
					timeoutMs: SLACK_TURN_TIMEOUT_MS,
					durationMs,
				})
				await msg.say({
					text: "The response took too long and was cancelled. Try a simpler request.",
					thread_ts: msg.threadTs,
				})
				return
			}

			// Re-throw for drainQueue to handle
			throw err
		} finally {
			timeout?.cleanup()
		}
	}

	/**
	 * Drain the message queue for a session, processing one message at a time.
	 * Automatically cleans up when the queue is empty.
	 */
	private async drainQueue(sessionId: string): Promise<void> {
		if (this.activeSessions.has(sessionId)) return
		this.activeSessions.add(sessionId)

		const queue = this.messageQueues.get(sessionId)
		const queueDepth = queue?.length ?? 0
		log.debug("Draining queue", { sessionId, queueDepth })

		try {
			while (queue && queue.length > 0) {
				const msg = queue.shift()!
				try {
					await this.processMessage(msg)
				} catch (err) {
					const errorText = err instanceof Error ? err.message : "unknown error"
					log.error("processMessage threw", {
						sessionId,
						error: errorText,
					})
					try {
						await msg.say({ text: `Error: ${errorText}`, thread_ts: msg.threadTs })
					} catch (sayErr) {
						log.error("Failed to send error reply to Slack", {
							sessionId,
							error: sayErr instanceof Error ? sayErr.message : String(sayErr),
						})
					}
				}
			}
		} finally {
			this.activeSessions.delete(sessionId)
			// Clean up empty queues
			const remaining = this.messageQueues.get(sessionId)
			if (remaining && remaining.length === 0) {
				this.messageQueues.delete(sessionId)
			}
			log.debug("Queue drained", { sessionId })
		}
	}

	// -----------------------------------------------------------------------
	// Inbound message handler
	// -----------------------------------------------------------------------

	private async handleMessage({ message, say }: MessageEvent): Promise<void> {
		if (!this.sessionManager) return
		if (!("text" in message) || !message.text) return
		if ("bot_id" in message) return

		const channel = message.channel
		const threadTs = ("thread_ts" in message ? message.thread_ts : message.ts) ?? message.ts
		const currentTs = message.ts
		const userText = message.text

		// Resolve the Slack user to an OpenZosma user by email
		const slackUserId = "user" in message ? message.user : undefined
		if (!slackUserId) return

		log.info("Received Slack message", {
			channel,
			threadTs,
			slackUserId,
			textLength: userText.length,
		})

		const userId = await this.resolveUserId(slackUserId)
		if (!userId) {
			await say({
				text: "Your Slack account email is not linked to an OpenZosma account. Please sign up with the same email address.",
				thread_ts: threadTs,
			})
			return
		}

		const sessionId = await this.getOrCreateSession(channel, threadTs, userId)

		// Build Slack context and prepend to message
		const contextBlock = await this.buildMessageContext(slackUserId, channel, threadTs, currentTs)
		const enrichedText = contextBlock ? `${contextBlock}\n${userText}` : userText

		// Enqueue the enriched message
		if (!this.messageQueues.has(sessionId)) {
			this.messageQueues.set(sessionId, [])
		}
		const queue = this.messageQueues.get(sessionId)!
		queue.push({
			sessionId,
			userId,
			text: enrichedText,
			threadTs,
			say,
		})

		log.debug("Message enqueued", { sessionId, queueDepth: queue.length, hasContext: Boolean(contextBlock) })

		// Start draining (no-op if already draining for this session)
		void this.drainQueue(sessionId)
	}
}
