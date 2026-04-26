/**
 * Heavy command implementations for the pi-harness CLI.
 *
 * This module is dynamically imported by cli.ts only when needed,
 * so that lightweight commands (help, version, status) don't trigger
 * module resolution for heavy dependencies like pi-coding-agent.
 */

import { spawn } from "node:child_process"
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { serve } from "@hono/node-server"
import { loadConfig } from "./config.js"
import { createLogger } from "./logger.js"
import { createHarnessApp } from "./server.js"

const C = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
	dim: "\x1b[2m",
}

const CONFIG_DIR = resolve(process.env.HOME ?? "/tmp", ".pi-harness")
const ENV_FILE = resolve(CONFIG_DIR, ".env")
const PID_FILE = resolve(CONFIG_DIR, "server.pid")
const LOG_FILE = resolve(CONFIG_DIR, "server.log")

function printBanner(): void {
	console.log(`
${C.cyan}${C.bold}
┌─────────────────────────────────────────────────────────┐
│              ⚡ Pi-Harness                              │
├─────────────────────────────────────────────────────────┤
│  Standalone headless agent harness for pi-coding-agent  │
│  Built with gratitude for Mario Zechner's pi-mono       │
└─────────────────────────────────────────────────────────┘
${C.reset}`)
}

export async function cmdStart(options: {
	daemon?: boolean
	port?: number
	host?: string
}): Promise<void> {
	// Load env file
	if (existsSync(ENV_FILE)) {
		const envContent = readFileSync(ENV_FILE, "utf-8")
		for (const line of envContent.split("\n")) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith("#")) continue
			const eq = trimmed.indexOf("=")
			if (eq > 0) {
				const key = trimmed.slice(0, eq)
				const value = trimmed.slice(eq + 1)
				if (!process.env[key]) process.env[key] = value
			}
		}
	}

	// Override from CLI
	if (options.port) process.env.PI_HARNESS_PORT = String(options.port)
	if (options.host) process.env.PI_HARNESS_HOST = options.host

	const port = process.env.PI_HARNESS_PORT ?? "8080"
	const host = process.env.PI_HARNESS_HOST ?? "0.0.0.0"

	if (options.daemon) {
		// Stop existing daemon first
		try {
			const pid = Number.parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10)
			if (!Number.isNaN(pid)) {
				try {
					process.kill(pid, 0)
					console.log(`${C.yellow}⚠ Daemon already running. Stopping first...${C.reset}`)
					process.kill(pid, "SIGTERM")
					try {
						require("node:fs").unlinkSync(PID_FILE)
					} catch {
						/* ignore */
					}
				} catch {
					/* not running */
				}
			}
		} catch {
			/* no pid file */
		}

		const out = openSync(LOG_FILE, "a")
		const err = openSync(LOG_FILE, "a")

		const serverPath = resolve(fileURLToPath(import.meta.url), "../index.js")
		const child = spawn(process.execPath, [serverPath], {
			detached: true,
			stdio: ["ignore", out, err],
			env: process.env,
		})

		closeSync(out)
		closeSync(err)

		child.unref()
		writeFileSync(PID_FILE, String(child.pid))

		console.log(`${C.green}✓ Daemon started${C.reset} (PID: ${child.pid})`)
		console.log(`${C.cyan}  →${C.reset} http://${host}:${port}`)
		console.log(`${C.cyan}  →${C.reset} Logs: ${LOG_FILE}`)
		console.log(`${C.dim}  →${C.reset} Stop: pi-harness stop`)
	} else {
		// Foreground mode
		printBanner()
		console.log(`${C.cyan}→${C.reset} Starting server on http://${host}:${port}\n`)

		const config = loadConfig()
		const app = createHarnessApp(config)
		const log = createLogger({ component: "pi-harness" })

		serve(
			{
				fetch: app.fetch,
				port: config.port,
				hostname: config.host,
			},
			(info) => {
				log.info(`Pi-harness listening on http://${info.address}:${info.port}`)
			},
		)

		const shutdown = (signal: string) => {
			log.info(`Received ${signal}, shutting down...`)
			process.exit(0)
		}
		process.on("SIGTERM", () => shutdown("SIGTERM"))
		process.on("SIGINT", () => shutdown("SIGINT"))
	}
}

export async function cmdTui(): Promise<void> {
	// Load env
	if (existsSync(ENV_FILE)) {
		const envContent = readFileSync(ENV_FILE, "utf-8")
		for (const line of envContent.split("\n")) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith("#")) continue
			const eq = trimmed.indexOf("=")
			if (eq > 0) {
				const key = trimmed.slice(0, eq)
				const value = trimmed.slice(eq + 1)
				if (!process.env[key]) process.env[key] = value
			}
		}
	}

	// Spawn TUI as child process (needs its own stdin/stdout)
	const tuiPath = resolve(fileURLToPath(import.meta.url), "../tui.js")
	const child = spawn(process.execPath, [tuiPath], {
		stdio: "inherit",
		env: process.env,
	})

	await new Promise<void>((resolve) => {
		child.on("exit", () => resolve())
	})
}
