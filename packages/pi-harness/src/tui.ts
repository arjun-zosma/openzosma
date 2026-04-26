#!/usr/bin/env node
import { stdin as input, stdout as output } from "node:process"
import * as readline from "node:readline"
/**
 * Pi-Harness TUI Client
 *
 * An interactive terminal chat client for pi-harness.
 * Connects to a running pi-harness server via HTTP/SSE.
 *
 * Usage:
 *   pi-harness-tui                    # Connect to http://localhost:8080
 *   pi-harness-tui --url http://host:9000 --key my-secret
 *   pi-harness-tui --session <existing-id>
 */
import chalk from "chalk"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
interface TuiConfig {
	baseUrl: string
	apiKey?: string
	sessionId?: string
}

function parseArgs(): TuiConfig {
	const args = process.argv.slice(2)
	const config: TuiConfig = {
		baseUrl: process.env.PI_HARNESS_URL ?? "http://localhost:8080",
	}

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--url":
			case "-u":
				config.baseUrl = args[++i]
				break
			case "--key":
			case "-k":
				config.apiKey = args[++i]
				break
			case "--session":
			case "-s":
				config.sessionId = args[++i]
				break
			case "--help":
			case "-h":
				console.log(`
Pi-Harness TUI Client

Usage: pi-harness-tui [options]

Options:
  -u, --url <url>       Server URL (default: http://localhost:8080)
  -k, --key <key>       API key for authentication
  -s, --session <id>    Connect to existing session
  -h, --help            Show this help

Environment:
  PI_HARNESS_URL        Default server URL
  PI_HARNESS_API_KEY    Default API key
`)
				process.exit(0)
		}
	}

	if (!config.apiKey) {
		config.apiKey = process.env.PI_HARNESS_API_KEY
	}

	return config
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------
class HarnessClient {
	private baseUrl: string
	private apiKey?: string

	constructor(config: TuiConfig) {
		this.baseUrl = config.baseUrl.replace(/\/$/, "")
		this.apiKey = config.apiKey
	}

	private headers(): Record<string, string> {
		const h: Record<string, string> = { "Content-Type": "application/json" }
		if (this.apiKey) h["x-api-key"] = this.apiKey
		return h
	}

	async health(): Promise<{ status: string; sessions: number; uptime: number }> {
		const res = await fetch(`${this.baseUrl}/health`)
		if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
		return res.json() as Promise<{ status: string; sessions: number; uptime: number }>
	}

	async createSession(opts?: {
		systemPromptPrefix?: string
		toolsEnabled?: string[]
		model?: string
		provider?: string
	}): Promise<{ sessionId: string }> {
		const res = await fetch(`${this.baseUrl}/sessions`, {
			method: "POST",
			headers: this.headers(),
			body: JSON.stringify(opts ?? {}),
		})
		if (!res.ok) {
			const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string }
			throw new Error(err.error ?? `Failed to create session: ${res.status}`)
		}
		return res.json() as Promise<{ sessionId: string }>
	}

	async listSessions(): Promise<{ sessions: string[] }> {
		const res = await fetch(`${this.baseUrl}/sessions`, { headers: this.headers() })
		if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`)
		return res.json() as Promise<{ sessions: string[] }>
	}

	async *sendMessage(sessionId: string, content: string, signal?: AbortSignal): AsyncGenerator<unknown> {
		const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/messages`, {
			method: "POST",
			headers: this.headers(),
			body: JSON.stringify({ content }),
			signal,
		})

		if (!res.ok || !res.body) {
			const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string }
			throw new Error(err.error ?? `Failed to send message: ${res.status}`)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split("\n")
				buffer = lines.pop() ?? ""

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6).trim()
						if (data) {
							try {
								yield JSON.parse(data)
							} catch {
								yield { type: "raw", data }
							}
						}
					}
				}
			}
		} finally {
			reader.releaseLock()
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
			method: "DELETE",
			headers: this.headers(),
		})
	}
}

// ---------------------------------------------------------------------------
// Terminal UI
// ---------------------------------------------------------------------------
interface ChatMessage {
	role: "user" | "assistant" | "system" | "tool"
	content: string
	toolName?: string
	toolResult?: string
	isError?: boolean
}

class Tui {
	private client: HarnessClient
	private config: TuiConfig
	private sessionId?: string
	private messages: ChatMessage[] = []
	private rl: readline.Interface
	private isStreaming = false
	private currentAssistantText = ""
	private abortController?: AbortController
	private inputHistory: string[] = []

	constructor(config: TuiConfig) {
		this.config = config
		this.client = new HarnessClient(config)
		this.rl = readline.createInterface({ input, output })
	}

	async start(): Promise<void> {
		this.clearScreen()
		this.printHeader()

		// Verify server is reachable
		try {
			const health = await this.client.health()
			this.printSystem(
				`Connected to ${this.config.baseUrl} | Active sessions: ${health.sessions} | Uptime: ${Math.floor(health.uptime)}s`,
			)
		} catch (err: unknown) {
			this.printError(`Cannot connect to ${this.config.baseUrl}`)
			this.printError(err instanceof Error ? err.message : String(err))
			process.exit(1)
		}

		// Create or connect to session
		if (this.config.sessionId) {
			this.sessionId = this.config.sessionId
			this.printSystem(`Connected to session: ${this.sessionId}`)
		} else {
			try {
				const session = await this.client.createSession()
				this.sessionId = session.sessionId
				this.printSystem(`New session created: ${this.sessionId}`)
			} catch (err: unknown) {
				this.printError(`Failed to create session: ${err instanceof Error ? err.message : String(err)}`)
				process.exit(1)
			}
		}

		this.printHelpHint()
		this.prompt()

		this.rl.on("line", (line) => this.handleInput(line))
		this.rl.on("close", () => this.shutdown())

		// Handle Ctrl+C gracefully
		input.on("keypress", (_str, key) => {
			if (key.ctrl && key.name === "c" && this.isStreaming) {
				this.cancelStream()
			}
		})
	}

	private clearScreen(): void {
		output.write("\x1b[2J\x1b[H")
	}

	private printHeader(): void {
		const title = "═".repeat(60)
		output.write(`\n${chalk.cyan(title)}\n`)
		output.write(chalk.cyan.bold("  🤖  Pi-Harness TUI Client\n"))
		output.write(`${chalk.cyan(title)}\n\n`)
	}

	private printHelpHint(): void {
		this.printSystem("Type /help for commands, /quit to exit. Ctrl+C to cancel streaming.")
	}

	private printSystem(text: string): void {
		this.messages.push({ role: "system", content: text })
		output.write(`${chalk.gray("ℹ ")}${chalk.gray(text)}\n`)
	}

	private printError(text: string): void {
		this.messages.push({ role: "system", content: text })
		output.write(`${chalk.red("✖ ")}${chalk.red(text)}\n`)
	}

	private printUser(text: string): void {
		this.messages.push({ role: "user", content: text })
		output.write(`\n${chalk.green.bold("> ")}${chalk.white(text)}\n`)
	}

	private printAssistantStart(): void {
		output.write(`\n${chalk.blue.bold("🤖 ")}`)
	}

	private printAssistantChunk(text: string): void {
		output.write(chalk.white(text))
	}

	private printAssistantEnd(): void {
		output.write("\n")
	}

	private printToolStart(toolName: string, toolArgs?: string): void {
		const args = toolArgs ? chalk.gray(` ${toolArgs.slice(0, 80)}${toolArgs.length > 80 ? "..." : ""}`) : ""
		output.write(`\n  ${chalk.yellow("▶")} ${chalk.yellow.bold(toolName)}${args}\n`)
	}

	private printToolEnd(toolName: string, result: string, isError?: boolean): void {
		const icon = isError ? chalk.red("✖") : chalk.green("✓")
		const resultPreview = result.slice(0, 200).replace(/\n/g, " ")
		const suffix = result.length > 200 ? "..." : ""
		output.write(
			`  ${icon} ${chalk.gray(`${toolName}`)} ${isError ? chalk.red(resultPreview + suffix) : chalk.gray(resultPreview + suffix)}\n`,
		)
	}

	private prompt(): void {
		this.rl.prompt()
	}

	private async handleInput(line: string): Promise<void> {
		const trimmed = line.trim()
		if (!trimmed) {
			this.prompt()
			return
		}

		// Add to history
		if (this.inputHistory.length === 0 || this.inputHistory[this.inputHistory.length - 1] !== trimmed) {
			this.inputHistory.push(trimmed)
		}
		// Handle commands
		if (trimmed.startsWith("/")) {
			await this.handleCommand(trimmed)
			return
		}

		if (!this.sessionId) {
			this.printError("No active session")
			this.prompt()
			return
		}

		this.printUser(trimmed)
		await this.streamResponse(trimmed)
	}

	private async handleCommand(cmd: string): Promise<void> {
		const parts = cmd.split(" ")
		const command = parts[0]
		const args = parts.slice(1)

		switch (command) {
			case "/help":
			case "/h":
				this.printHelp()
				break

			case "/quit":
			case "/q":
				this.shutdown()
				return

			case "/new":
				try {
					const session = await this.client.createSession()
					this.sessionId = session.sessionId
					this.messages = []
					this.printSystem(`New session: ${this.sessionId}`)
				} catch (err: unknown) {
					this.printError(`Failed to create session: ${err instanceof Error ? err.message : String(err)}`)
				}
				break

			case "/sessions":
				try {
					const { sessions } = await this.client.listSessions()
					if (sessions.length === 0) {
						this.printSystem("No active sessions")
					} else {
						this.printSystem(`Active sessions (${sessions.length}):`)
						sessions.forEach((id) => {
							const marker = id === this.sessionId ? chalk.cyan(" → ") : "    "
							output.write(`${marker}${chalk.gray(id)}\n`)
						})
					}
				} catch (err: unknown) {
					this.printError(`Failed to list sessions: ${err instanceof Error ? err.message : String(err)}`)
				}
				break

			case "/switch":
				if (!args[0]) {
					this.printError("Usage: /switch <session-id>")
				} else {
					this.sessionId = args[0]
					this.messages = []
					this.printSystem(`Switched to session: ${this.sessionId}`)
				}
				break

			case "/clear":
				this.messages = []
				this.clearScreen()
				this.printHeader()
				this.printSystem("Chat history cleared")
				break

			case "/model":
				if (!args[0]) {
					this.printError("Usage: /model <model-id>")
				} else {
					this.printSystem(`Model preference set to: ${args[0]} (applies to new sessions)`)
				}
				break

			default:
				this.printError(`Unknown command: ${command}. Type /help for available commands.`)
		}

		this.prompt()
	}

	private printHelp(): void {
		output.write(`
${chalk.cyan.bold("Commands:")}
  ${chalk.green("/help")}, ${chalk.green("/h")}       Show this help
  ${chalk.green("/quit")}, ${chalk.green("/q")}       Exit the TUI
  ${chalk.green("/new")}            Create a new session
  ${chalk.green("/sessions")}       List all active sessions
  ${chalk.green("/switch <id>")}    Switch to another session
  ${chalk.green("/clear")}          Clear chat history
  ${chalk.green("/model <id>")}     Set model for new sessions

${chalk.cyan.bold("Shortcuts:")}
  ${chalk.yellow("Ctrl+C")}         Cancel streaming response
  ${chalk.yellow("↑ / ↓")}          Navigate input history

`)
	}

	private async streamResponse(content: string): Promise<void> {
		if (!this.sessionId) return

		this.isStreaming = true
		this.abortController = new AbortController()
		this.currentAssistantText = ""

		let assistantStarted = false
		let currentToolName = ""
		let currentToolArgs = ""

		try {
			for await (const event of this.client.sendMessage(this.sessionId, content, this.abortController.signal)) {
				const e = event as Record<string, unknown>

				switch (e.type) {
					case "turn_start":
						assistantStarted = false
						break

					case "message_start":
						if (!assistantStarted) {
							this.printAssistantStart()
							assistantStarted = true
						}
						break

					case "message_update":
						if (!assistantStarted) {
							this.printAssistantStart()
							assistantStarted = true
						}
						if (e.text) {
							this.currentAssistantText += String(e.text)
							this.printAssistantChunk(String(e.text))
						}
						break

					case "message_end":
						this.printAssistantEnd()
						this.messages.push({
							role: "assistant",
							content: this.currentAssistantText,
						})
						this.currentAssistantText = ""
						break

					case "tool_call_start":
						currentToolName = String(e.toolName ?? "")
						currentToolArgs = String(e.toolArgs ?? "")
						this.printToolStart(currentToolName, currentToolArgs)
						break

					case "tool_call_end":
						this.printToolEnd(String(e.toolName ?? currentToolName), String(e.toolResult ?? ""), Boolean(e.isToolError))
						this.messages.push({
							role: "tool",
							toolName: String(e.toolName ?? currentToolName),
							content: String(e.toolResult ?? ""),
							isError: Boolean(e.isToolError),
						})
						break

					case "thinking_update":
						if (e.text) {
							output.write(chalk.gray(String(e.text)))
						}
						break

					case "error":
						this.printError(String(e.error ?? "Unknown error"))
						break

					case "turn_end":
						this.isStreaming = false
						this.prompt()
						return

					case "auto_retry_start":
						output.write(`\n  ${chalk.yellow("⟳")} ${chalk.yellow("Retrying...")}\n`)
						break

					case "auto_compaction_start":
						output.write(`\n  ${chalk.yellow("⚡")} ${chalk.yellow("Compacting conversation...")}\n`)
						break
				}
			}
		} catch (err: unknown) {
			if (err instanceof Error && err.name === "AbortError") {
				output.write(`\n  ${chalk.yellow("⏹")} ${chalk.yellow("Cancelled")}\n`)
			} else {
				this.printError(err instanceof Error ? err.message : String(err))
			}
		} finally {
			this.isStreaming = false
			this.abortController = undefined
			this.prompt()
		}
	}

	private cancelStream(): void {
		if (this.abortController) {
			this.abortController.abort()
		}
	}

	private async shutdown(): Promise<void> {
		output.write(`\n${chalk.gray("Shutting down...")}\n`)
		this.rl.close()
		if (this.sessionId) {
			try {
				await this.client.deleteSession(this.sessionId)
				output.write(`${chalk.gray("Session ended.")}\n`)
			} catch {
				// Ignore cleanup errors
			}
		}
		process.exit(0)
	}
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
	const config = parseArgs()
	const tui = new Tui(config)
	await tui.start()
}

main().catch((err: unknown) => {
	console.error(chalk.red("Fatal error:"), err)
	process.exit(1)
})
