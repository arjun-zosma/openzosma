/**
 * Pi-Harness CLI
 *
 * The primary entry point for the pi-harness global command.
 *
 * Usage:
 *   pi-harness              Start server (runs setup on first use)
 *   pi-harness start        Start server in foreground
 *   pi-harness start -d     Start server as background daemon
 *   pi-harness stop         Stop background daemon
 *   pi-harness status       Check daemon status
 *   pi-harness setup        Run interactive setup wizard
 *   pi-harness tui          Launch TUI client
 *   pi-harness logs         Tail server logs
 *   pi-harness --help       Show this help
 *   pi-harness --version    Show version
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), ".pi-harness")
const ENV_FILE = join(CONFIG_DIR, ".env")
const PID_FILE = join(CONFIG_DIR, "server.pid")
const LOG_FILE = join(CONFIG_DIR, "server.log")
const SETUP_SCRIPT = resolve(fileURLToPath(import.meta.url), "../../scripts/setup.sh")

// Get version from package.json
function getVersion(): string {
	try {
		const pkgPath = resolve(fileURLToPath(import.meta.url), "../../package.json")
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
		return pkg.version ?? "0.1.0"
	} catch {
		return "0.1.0"
	}
}

const VERSION = getVersion()

// Colors
const C = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	dim: "\x1b[2m",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printHelp(): void {
	console.log(`
${C.bold}${C.magenta}Pi-Harness${C.reset} ${C.cyan}v${VERSION}${C.reset}
${C.dim}The top-level harness for the Pi ecosystem${C.reset}

${C.bold}Usage:${C.reset} pi-harness <command> [options]

${C.bold}Commands:${C.reset}
  ${C.green}start${C.reset} [options]   Start the server
    ${C.yellow}-d, --daemon${C.reset}  Run in background
    ${C.yellow}-p, --port${C.reset}    Override port
    ${C.yellow}--host${C.reset}        Override host

  ${C.green}stop${C.reset}            Stop the background daemon
  ${C.green}status${C.reset}          Check if daemon is running
  ${C.green}setup${C.reset}           Run interactive setup wizard
  ${C.green}tui${C.reset}             Launch TUI client
  ${C.green}logs${C.reset}            Tail server logs

${C.bold}Options:${C.reset}
  ${C.yellow}-h, --help${C.reset}      Show this help
  ${C.yellow}-v, --version${C.reset}   Show version

${C.bold}Quick Start:${C.reset}
  ${C.cyan}pi-harness${C.reset}              First run → setup → start server
  ${C.cyan}pi-harness start --daemon${C.reset}  Start in background
  ${C.cyan}pi-harness tui${C.reset}            Connect with TUI client
`)
}

function isConfigured(): boolean {
	return existsSync(ENV_FILE)
}

function ensureConfigDir(): void {
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true })
	}
}

function readPid(): number | null {
	try {
		const pid = Number.parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10)
		return Number.isNaN(pid) ? null : pid
	} catch {
		return null
	}
}

function isDaemonRunning(): boolean {
	const pid = readPid()
	if (!pid) return false
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

function printBanner(): void {
	console.log(`
${C.magenta}${C.bold}
┌─────────────────────────────────────────────────────────┐
│              ⚡ Pi-Harness v${VERSION.padEnd(43, " ").slice(0, 43)}│
├─────────────────────────────────────────────────────────┤
│  Standalone headless agent harness for pi-coding-agent  │
│  Built with gratitude for Mario Zechner's pi-mono       │
└─────────────────────────────────────────────────────────┘
${C.reset}`)
}

// ---------------------------------------------------------------------------
// Lightweight commands (no heavy deps)
// ---------------------------------------------------------------------------

async function cmdSetup(): Promise<void> {
	ensureConfigDir()
	printBanner()

	if (!existsSync(SETUP_SCRIPT)) {
		console.error(`${C.red}✗ Setup script not found:${C.reset} ${SETUP_SCRIPT}`)
		console.error("  Run setup manually or reinstall pi-harness.")
		process.exit(1)
	}

	try {
		execSync(`bash "${SETUP_SCRIPT}"`, {
			stdio: "inherit",
			env: { ...process.env, ENV_FILE },
		})
	} catch {
		process.exit(1)
	}
}

async function cmdStop(): Promise<void> {
	const pid = readPid()
	if (!pid) {
		console.log(`${C.yellow}⚠ No daemon PID found.${C.reset}`)
		return
	}

	if (!isDaemonRunning()) {
		console.log(`${C.yellow}⚠ Daemon not running (stale PID file).${C.reset}`)
		try {
			unlinkSync(PID_FILE)
		} catch {
			/* ignore */
		}
		return
	}

	try {
		process.kill(pid, "SIGTERM")
		console.log(`${C.green}✓ Daemon stopped${C.reset} (PID: ${pid})`)
		try {
			unlinkSync(PID_FILE)
		} catch {
			/* ignore */
		}
	} catch (err) {
		console.error(`${C.red}✗ Failed to stop daemon:${C.reset}`, err)
		process.exit(1)
	}
}

async function cmdStatus(): Promise<void> {
	const pid = readPid()
	if (!pid) {
		console.log(`${C.yellow}● Daemon: not running${C.reset}`)
		return
	}

	try {
		process.kill(pid, 0)
		console.log(`${C.green}● Daemon: running${C.reset} (PID: ${pid})`)
		console.log(`${C.dim}  →${C.reset} Logs: ${LOG_FILE}`)
	} catch {
		console.log(`${C.red}● Daemon: not running${C.reset} (stale PID: ${pid})`)
		try {
			unlinkSync(PID_FILE)
		} catch {
			/* ignore */
		}
	}
}

async function cmdLogs(): Promise<void> {
	if (!existsSync(LOG_FILE)) {
		console.log(`${C.yellow}⚠ No log file found.${C.reset}`)
		return
	}

	try {
		execSync(`tail -f "${LOG_FILE}"`, { stdio: "inherit" })
	} catch {
		// User pressed Ctrl+C
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		options: {
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
			daemon: { type: "boolean", short: "d" },
			port: { type: "string", short: "p" },
			host: { type: "string" },
		},
		allowPositionals: true,
	})

	if (values.help) {
		printHelp()
		process.exit(0)
	}

	if (values.version) {
		console.log(VERSION)
		process.exit(0)
	}

	const command = positionals[0] ?? "start"

	switch (command) {
		case "start": {
			// First-run setup
			if (!isConfigured()) {
				console.log(`${C.yellow}⚠ First run detected. Let's set up pi-harness.${C.reset}\n`)
				await cmdSetup()
				console.log("")
			}
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
			// Dynamic import of heavy commands
			const { cmdStart } = await import("./commands.js")
			await cmdStart({
				daemon: values.daemon,
				port: values.port ? Number.parseInt(values.port, 10) : undefined,
				host: values.host,
			})
			break
		}
		case "stop":
			await cmdStop()
			break
		case "status":
			await cmdStatus()
			break
		case "setup":
			await cmdSetup()
			break
		case "tui": {
			if (!isConfigured()) {
				console.log(`${C.yellow}⚠ Not configured yet. Run:${C.reset} pi-harness setup`)
				process.exit(1)
			}
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
			const { cmdTui } = await import("./commands.js")
			await cmdTui()
			break
		}
		case "logs":
			await cmdLogs()
			break
		default:
			console.error(`${C.red}Unknown command:${C.reset} ${command}`)
			console.error(`Run ${C.cyan}pi-harness --help${C.reset} for usage.`)
			process.exit(1)
	}
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
