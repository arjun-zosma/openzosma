import { type ChildProcess, execFile, spawn } from "node:child_process"
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, relative } from "node:path"
import { promisify } from "node:util"
import { createLogger } from "@openzosma/logger"
import { OpenShellCliError, SandboxNotFoundError, SandboxNotReadyError, SandboxTimeoutError } from "./errors.js"
import type { ExecResult, SandboxConfig, SandboxInfo, SandboxPhase } from "./types.js"

const execFileAsync = promisify(execFile)

const log = createLogger({ component: "sandbox" })

/** Default timeout for CLI commands (30 seconds). */
const DEFAULT_CLI_TIMEOUT_MS = 30_000

/** Default timeout for waiting on sandbox readiness (5 minutes). */
const DEFAULT_READY_TIMEOUT_MS = 300_000

/** Polling interval when waiting for sandbox readiness (2 seconds). */
const READY_POLL_INTERVAL_MS = 2_000

/** Default agent HTTP server port inside the sandbox. */
const DEFAULT_AGENT_PORT = 3000

/**
 * TypeScript wrapper around the `openshell` CLI.
 *
 * All sandbox lifecycle operations go through this class. It spawns
 * the `openshell` binary as a child process and parses its output.
 * This follows NemoClaw's runner.py pattern where all OpenShell
 * interaction happens via the CLI.
 *
 * CLI reference (from `openshell sandbox --help`):
 *   create   - Create a sandbox (--from, --name, --policy, --gpu, --upload)
 *   get      - Fetch a sandbox by name (text output, no JSON flag)
 *   list     - List sandboxes (--names, --ids for machine-readable)
 *   delete   - Delete a sandbox by name
 *   connect  - Interactive shell into a sandbox
 *   upload   - Upload local files to a sandbox
 *   download - Download files from a sandbox
 *
 * Notable: there is no `sandbox exec` command. For running commands
 * inside a sandbox, use `sandbox create ... -- <command>` (one-shot)
 * or SSH via `sandbox ssh-config`. For file injection, use `upload`.
 * For HTTP access, use `forward start`.
 */
export class OpenShellClient {
	private readonly bin: string

	constructor(opts?: { bin?: string }) {
		this.bin = opts?.bin ?? "openshell"
	}

	// -----------------------------------------------------------------------
	// Lifecycle
	// -----------------------------------------------------------------------

	/**
	 * Create a new sandbox.
	 *
	 * Uses `--from` for the container image/source.
	 * If `config.policyPath` is provided, it is passed via `--policy`.
	 * If `config.command` is provided, it is passed after `--` so the
	 * sandbox runs our entrypoint instead of `sleep infinity`.
	 *
	 * When a command is provided, `sandbox create` blocks (stays attached
	 * to the SSH session). We spawn it in the background and poll
	 * `sandbox get` until the sandbox is Ready.
	 */
	async create(name: string, config: SandboxConfig): Promise<SandboxInfo> {
		const args = ["sandbox", "create", "--name", name]

		if (config.image) {
			args.push("--from", config.image)
		}
		if (config.policyPath) {
			args.push("--policy", config.policyPath)
		}
		if (config.gpu) {
			args.push("--gpu")
		}
		if (config.command) {
			args.push("--no-tty", "--", ...config.command)
		}

		if (config.command) {
			// When a command is specified, `sandbox create` blocks while the
			// command runs inside the sandbox. Spawn in background and poll
			// for readiness instead of waiting for exit.
			const child = this.spawnBackground(args)

			try {
				// allowNotFound: the background CLI hasn't registered the sandbox
				// yet, so `sandbox get` may return "not found" for the first few
				// seconds. Keep retrying until it appears or the timeout expires.
				const info = await this.waitReady(name, DEFAULT_READY_TIMEOUT_MS, { allowNotFound: true })
				return info
			} catch (err) {
				// Clean up the background process on failure
				child.kill()
				throw err
			}
		}

		await this.run(args, 120_000)

		// Fetch the sandbox info after creation
		const info = await this.get(name)
		if (!info) {
			throw new SandboxNotFoundError(name)
		}
		return info
	}

	/**
	 * Get information about a sandbox by name.
	 * Returns null if the sandbox does not exist.
	 *
	 * The CLI outputs human-readable text (no JSON flag). We parse
	 * key-value lines from the output.
	 */
	async get(name: string): Promise<SandboxInfo | null> {
		try {
			const { stdout } = await this.run(["sandbox", "get", name])
			return parseTextSandboxInfo(name, stdout)
		} catch (err) {
			if (err instanceof OpenShellCliError && (err.exitCode === 1 || err.stderr?.includes("not found"))) {
				return null
			}
			throw err
		}
	}

	/**
	 * List all sandbox names.
	 *
	 * Uses `--names` for machine-readable output (one name per line).
	 */
	async listNames(): Promise<string[]> {
		try {
			const { stdout } = await this.run(["sandbox", "list", "--names"])
			return stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
		} catch {
			return []
		}
	}

	/**
	 * List all sandboxes with full info.
	 *
	 * Fetches names first, then gets info for each. Use `listNames()`
	 * when you only need names.
	 */
	async list(): Promise<SandboxInfo[]> {
		const names = await this.listNames()
		const results: SandboxInfo[] = []
		for (const name of names) {
			const info = await this.get(name)
			if (info) results.push(info)
		}
		return results
	}

	/**
	 * Delete a sandbox by name.
	 */
	async delete(name: string): Promise<void> {
		await this.run(["sandbox", "delete", name])
	}

	/**
	 * Poll until the sandbox reaches the "ready" phase or errors out.
	 *
	 * @param name      Sandbox name.
	 * @param timeoutMs Maximum time to wait before giving up.
	 * @param opts.allowNotFound  When true, a "not found" response is treated
	 *   as retryable (the sandbox hasn't registered yet) instead of a terminal
	 *   error. This is needed when polling immediately after a background
	 *   `sandbox create` spawn, where the CLI hasn't finished registering the
	 *   sandbox with OpenShell yet.
	 */
	async waitReady(
		name: string,
		timeoutMs: number = DEFAULT_READY_TIMEOUT_MS,
		opts?: { allowNotFound?: boolean },
	): Promise<SandboxInfo> {
		const deadline = Date.now() + timeoutMs
		while (Date.now() < deadline) {
			const info = await this.get(name)
			if (!info) {
				if (opts?.allowNotFound) {
					// Sandbox hasn't appeared yet -- keep polling
					await sleep(READY_POLL_INTERVAL_MS)
					continue
				}
				throw new SandboxNotFoundError(name)
			}
			if (info.phase === "ready") {
				return info
			}
			if (info.phase === "error") {
				throw new SandboxNotReadyError(name, info.phase)
			}
			await sleep(READY_POLL_INTERVAL_MS)
		}
		throw new SandboxTimeoutError(name, "waitReady", timeoutMs)
	}

	// -----------------------------------------------------------------------
	// File transfer
	// -----------------------------------------------------------------------

	/**
	 * Upload a local file or directory into the sandbox.
	 *
	 * IMPORTANT: `openshell sandbox upload` treats `dest` as a directory
	 * and preserves the local filename. To place a file at `/sandbox/.env`,
	 * the local file must be named `.env` and `dest` must be `/sandbox/`.
	 *
	 * By default the CLI respects `.gitignore` rules, which means gitignored
	 * paths (like `.knowledge-base/`) are silently skipped. Pass
	 * `noGitIgnore: true` to disable this filtering and upload everything.
	 *
	 * @param name      Sandbox name.
	 * @param localPath Path on the host to upload.
	 * @param dest      Destination directory inside the sandbox (defaults to /sandbox).
	 * @param opts      Upload options.
	 */
	async upload(name: string, localPath: string, dest?: string, opts?: { noGitIgnore?: boolean }): Promise<void> {
		const args = ["sandbox", "upload"]
		if (opts?.noGitIgnore) {
			args.push("--no-git-ignore")
		}
		args.push(name, localPath)
		if (dest) {
			args.push(dest)
		}
		await this.run(args, 60_000)
	}

	/**
	 * Recursively upload a local directory into the sandbox.
	 *
	 * `openshell sandbox upload` only transfers individual files -- passing
	 * a directory silently succeeds but uploads nothing.  This method walks
	 * the local directory tree and uploads each file individually, preserving
	 * the directory structure inside the sandbox.
	 *
	 * Example: `uploadDir("sb", "/host/.knowledge-base", "/workspace/")`
	 * uploads each file in `.knowledge-base/` so they appear under
	 * `/workspace/.knowledge-base/` in the sandbox.
	 *
	 * @param name      Sandbox name.
	 * @param localDir  Local directory to upload.
	 * @param dest      Parent directory inside the sandbox (the local dir's
	 *                  basename is appended automatically).
	 */
	async uploadDir(name: string, localDir: string, dest: string): Promise<void> {
		const dirName = basename(localDir)
		const files = collectFiles(localDir)

		for (const filePath of files) {
			const rel = relative(localDir, filePath)
			// Destination is: dest + dirName + relative path's directory
			// e.g. /workspace/ + .knowledge-base/ + subdir/
			const parts = rel.split("/")
			const destDir = parts.length > 1 ? `${dest}${dirName}/${parts.slice(0, -1).join("/")}/` : `${dest}${dirName}/`

			await this.upload(name, filePath, destDir, { noGitIgnore: true })
		}
	}

	/**
	 * Write environment variables into a sandbox as `/sandbox/.env`.
	 *
	 * The OpenShell CLI does not support `--env` on `sandbox create`.
	 * Instead, we write a temporary .env file on the host and upload
	 * it into the sandbox via `sandbox upload`.
	 */
	async injectEnv(name: string, env: Record<string, string>): Promise<void> {
		const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`)
		const content = `${lines.join("\n")}\n`

		// `openshell sandbox upload <name> <local> <dest>` treats <dest> as a
		// directory and preserves the local filename. So the local file MUST be
		// named `.env` and the destination MUST be the parent directory `/sandbox/`.
		const tmpDir = mkdtempSync(join(tmpdir(), `openzosma-env-${name}-`))
		const tmpPath = join(tmpDir, ".env")
		writeFileSync(tmpPath, content, { mode: 0o600 })
		try {
			await this.upload(name, tmpPath, "/sandbox/")
		} finally {
			// Best-effort cleanup
			try {
				const { unlinkSync, rmdirSync } = await import("node:fs")
				unlinkSync(tmpPath)
				rmdirSync(tmpDir)
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	// -----------------------------------------------------------------------
	// Port forwarding
	// -----------------------------------------------------------------------

	/**
	 * Start port forwarding to a sandbox in the background.
	 *
	 * @param name Sandbox name.
	 * @param port Port to forward (e.g. 8080).
	 * @returns The local port that was forwarded.
	 */
	async forwardStart(name: string, port: number): Promise<number> {
		await this.run(["forward", "start", "-d", String(port), name], 30_000)
		return port
	}

	/**
	 * Stop port forwarding.
	 *
	 * @param port Port to stop forwarding.
	 * @param name Sandbox name.
	 */
	async forwardStop(port: number, name: string): Promise<void> {
		await this.run(["forward", "stop", String(port), name])
	}

	// -----------------------------------------------------------------------
	// Status helpers
	// -----------------------------------------------------------------------

	/**
	 * Check if a sandbox exists and is in the "ready" phase.
	 */
	async isReady(name: string): Promise<boolean> {
		const info = await this.get(name)
		return info?.phase === "ready"
	}

	/**
	 * Run a health check on the agent server inside the sandbox.
	 *
	 * Uses port forwarding to reach the agent's /health endpoint.
	 * If a forwarded port is already known, pass it directly.
	 */
	async healthCheck(_name: string, port: number = DEFAULT_AGENT_PORT): Promise<boolean> {
		try {
			// Try hitting the health endpoint via the forwarded port
			const response = await fetch(`http://localhost:${port}/health`, {
				signal: AbortSignal.timeout(5_000),
			})
			return response.ok
		} catch {
			return false
		}
	}

	// -----------------------------------------------------------------------
	// Run commands in a one-shot sandbox
	// -----------------------------------------------------------------------

	/**
	 * Run a command inside an existing sandbox by creating a temporary
	 * one-shot sandbox that shares the same environment, or by using
	 * SSH if configured. For now, this is a placeholder that returns
	 * an error -- the CLI has no `sandbox exec` subcommand.
	 *
	 * Callers that previously used `exec` should switch to `upload`
	 * for file operations or `forwardStart` + HTTP for communication.
	 */
	async exec(_name: string, _command: string[], _opts?: { timeoutMs?: number }): Promise<ExecResult> {
		return {
			exitCode: 1,
			stdout: "",
			stderr: "openshell sandbox exec is not available. Use upload or forward instead.",
		}
	}

	// -----------------------------------------------------------------------
	// Check CLI availability
	// -----------------------------------------------------------------------

	/**
	 * Verify the openshell CLI is installed and reachable.
	 * Returns the version string or throws.
	 */
	async version(): Promise<string> {
		const { stdout } = await this.run(["--version"])
		return stdout.trim()
	}

	// -----------------------------------------------------------------------
	// Internal
	// -----------------------------------------------------------------------

	private async run(
		args: string[],
		timeoutMs: number = DEFAULT_CLI_TIMEOUT_MS,
	): Promise<{ stdout: string; stderr: string }> {
		try {
			return await execFileAsync(this.bin, args, {
				timeout: timeoutMs,
				maxBuffer: 10 * 1024 * 1024,
				env: { ...process.env, NO_COLOR: "1" },
			})
		} catch (err: unknown) {
			const e = err as { message?: string; stderr?: string; code?: number | string }
			throw new OpenShellCliError(
				e.message ?? "openshell CLI command failed",
				`${this.bin} ${args.join(" ")}`,
				e.stderr,
				typeof e.code === "number" ? e.code : undefined,
			)
		}
	}

	/**
	 * Spawn an `openshell` command in the background without waiting for exit.
	 *
	 * Used when `sandbox create -- <command>` blocks while the sandbox's
	 * command runs. We detach from the process and poll for readiness
	 * separately.
	 *
	 * Captures stderr and logs errors. Previously this used `stdio: "ignore"`
	 * which silently swallowed CLI failures (e.g. policy YAML parse errors),
	 * making sandbox creation appear to hang forever.
	 */
	private spawnBackground(args: string[]): ChildProcess {
		const child = spawn(this.bin, args, {
			stdio: ["pipe", "pipe", "pipe"],
			detached: true,
			env: { ...process.env, NO_COLOR: "1" },
		})

		// Close stdin immediately -- the CLI's SSH session doesn't need
		// interactive input for our use case (running a server command).
		if (child.stdin) {
			child.stdin.end()
		}

		// Capture stdout for debugging
		if (child.stdout) {
			child.stdout.setEncoding("utf-8")
			child.stdout.on("data", (chunk: string) => {
				// Log entrypoint/CLI output for visibility
				for (const line of chunk.split("\n")) {
					if (line.trim()) {
						log.debug(`[openshell:bg] ${line}`)
					}
				}
			})
		}

		// Capture stderr for error logging
		let stderr = ""
		if (child.stderr) {
			child.stderr.setEncoding("utf-8")
			child.stderr.on("data", (chunk: string) => {
				stderr += chunk
			})
		}

		child.on("error", (err) => {
			log.error("Background spawn failed", { error: err.message })
		})

		child.on("exit", (code, signal) => {
			if (code !== null && code !== 0) {
				log.error(`Background process exited with code ${code}`, stderr ? { stderr: stderr.trim() } : undefined)
			} else if (signal) {
				log.warn(`Background process killed by signal ${signal}`)
			}
		})

		// Allow the parent process to exit without waiting for this child.
		child.unref()
		return child
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip ANSI escape sequences from a string.
 *
 * The `openshell` CLI emits ANSI color codes (bold, dim, fg color resets)
 * even when stdout is piped. These codes break our key-value text parser.
 * We strip them before parsing so regex matching works on plain text.
 */
function stripAnsi(str: string): string {
	// Matches common ANSI escape sequences: CSI (ESC[) followed by
	// parameter bytes, intermediate bytes, and a final byte.
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI stripping
	return str.replace(/\x1b\[[\d;]*[A-Za-z]/g, "")
}

/**
 * Parse the text output of `openshell sandbox get <name>`.
 *
 * The output format is human-readable key-value lines. We extract
 * known fields by matching common label patterns. If the output
 * contains JSON (future CLI versions), we try that first.
 *
 * IMPORTANT: The CLI output contains ANSI color codes that must be
 * stripped before parsing. Without stripping, the regex never matches
 * and waitReady() polls indefinitely (phase stays "unknown").
 */
function parseTextSandboxInfo(name: string, stdout: string): SandboxInfo | null {
	const clean = stripAnsi(stdout)
	if (!clean.trim()) return null

	// Try JSON first (in case a future CLI version adds it)
	try {
		const raw = JSON.parse(clean)
		if (typeof raw === "object" && raw !== null) {
			return mapRawSandbox(raw)
		}
	} catch {
		// Not JSON, parse text
	}

	const info: SandboxInfo = { name, phase: "unknown" }

	for (const line of clean.split("\n")) {
		const trimmed = line.trim()

		// Match patterns like "Status: Running", "Phase: ready", etc.
		const kvMatch = trimmed.match(/^([A-Za-z_\s]+?):\s*(.+)$/)
		if (!kvMatch) continue

		const key = kvMatch[1].trim().toLowerCase()
		const value = kvMatch[2].trim()

		if (key === "name" || key === "sandbox name" || key === "sandbox") {
			info.name = value
		} else if (key === "status" || key === "phase" || key === "state") {
			info.phase = mapPhase(value)
		} else if (key === "image" || key === "from" || key === "source") {
			info.image = value
		} else if (key === "namespace") {
			info.namespace = value
		} else if (key === "pod ip" || key === "ip" || key === "pod_ip" || key === "address") {
			info.podIp = value
		} else if (key === "created" || key === "created at" || key === "created_at") {
			info.createdAt = value
		}
	}

	return info
}

function mapRawSandbox(raw: Record<string, unknown>): SandboxInfo {
	return {
		name: (raw.name as string) ?? (raw.sandbox_name as string) ?? "",
		phase: mapPhase((raw.phase as string | undefined) ?? (raw.status as string | undefined)),
		image: raw.image as string | undefined,
		namespace: raw.namespace as string | undefined,
		podIp: (raw.pod_ip as string | undefined) ?? (raw.podIp as string | undefined),
		createdAt: (raw.created_at as string | undefined) ?? (raw.createdAt as string | undefined),
	}
}

function mapPhase(raw: string | undefined): SandboxPhase {
	if (!raw) return "unknown"
	const lower = raw.toLowerCase()
	if (lower.includes("ready") || lower.includes("running")) return "ready"
	if (lower.includes("creating") || lower.includes("provisioning")) return "provisioning"
	if (lower.includes("error") || lower.includes("fail")) return "error"
	if (lower.includes("deleting") || lower.includes("terminating")) return "deleting"
	if (lower.includes("suspend") || lower.includes("stopped")) return "suspended"
	return "unknown"
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Recursively collect all file paths under a directory.
 */
const collectFiles = (dir: string): string[] => {
	const results: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			results.push(...collectFiles(full))
		} else if (entry.isFile()) {
			results.push(full)
		}
	}
	return results
}
