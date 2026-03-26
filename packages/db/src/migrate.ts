import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createLogger } from "@openzosma/logger"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const log = createLogger({ component: "db" })

/**
 * Load an env file into process.env. Supports KEY=VALUE lines,
 * ignores comments (#) and blank lines, strips surrounding quotes.
 * Does not override existing env vars.
 */
function loadEnvFile(filePath: string): void {
	try {
		const contents = readFileSync(filePath, "utf-8")
		for (const line of contents.split("\n")) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith("#")) continue
			const eqIdx = trimmed.indexOf("=")
			if (eqIdx === -1) continue
			const key = trimmed.slice(0, eqIdx).trim()
			const value = trimmed
				.slice(eqIdx + 1)
				.trim()
				.replace(/^["']|["']$/g, "")
			if (key && !(key in process.env)) {
				process.env[key] = value
			}
		}
		log.info(`Loaded env file: ${filePath}`)
	} catch {
		// Silently ignore if file doesn't exist
	}
}

/**
 * Parse --env-file=<path> from argv. If not provided, tries
 * .env.local then .env in the repo root.
 */
function loadEnv(): void {
	const envFileArg = process.argv.find((arg) => arg.startsWith("--env-file="))
	if (envFileArg) {
		loadEnvFile(resolve(envFileArg.split("=")[1]))
		return
	}
	// Default: try .env.local first, then .env from repo root
	const repoRoot = resolve(__dirname, "..", "..", "..")
	loadEnvFile(join(repoRoot, ".env.local"))
	loadEnvFile(join(repoRoot, ".env"))
}

/**
 * Build DATABASE_URL from individual DB_* vars if not already set.
 */
function ensureDatabaseUrl(): void {
	if (process.env.DATABASE_URL) return
	const host = process.env.DB_HOST ?? "localhost"
	const port = process.env.DB_PORT ?? "5432"
	const db = process.env.DB_NAME ?? "openzosma"
	const user = process.env.DB_USER ?? "openzosma"
	const pass = process.env.DB_PASS ?? "openzosma"
	process.env.DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${db}`
}

// CLI entrypoint
loadEnv()
ensureDatabaseUrl()

const direction = process.argv.includes("down") ? "down" : "up"
const pkgDir = resolve(__dirname, "..")

try {
	execSync(`npx db-migrate ${direction} --env production --migrations-dir migrations`, {
		stdio: "inherit",
		env: process.env,
		cwd: pkgDir,
	})
	log.info(`Migrations ${direction} completed.`)
} catch {
	log.error(`Migration ${direction} failed.`)
	process.exit(1)
}
