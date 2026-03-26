import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createLogger } from "@openzosma/logger"
import pg from "pg"

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
	const repoRoot = resolve(__dirname, "..", "..", "..")
	loadEnvFile(join(repoRoot, ".env.local"))
	loadEnvFile(join(repoRoot, ".env"))
}

function getDatabaseUrl(): string {
	if (process.env.DATABASE_URL) {
		return process.env.DATABASE_URL
	}
	const host = process.env.DB_HOST ?? "localhost"
	const port = process.env.DB_PORT ?? "5432"
	const db = process.env.DB_NAME ?? "openzosma"
	const user = process.env.DB_USER ?? "openzosma"
	const pass = process.env.DB_PASS ?? "openzosma"
	return `postgresql://${user}:${pass}@${host}:${port}/${db}`
}

async function ensureAuthSchema(): Promise<void> {
	const pool = new pg.Pool({ connectionString: getDatabaseUrl() })
	try {
		const result = await pool.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'auth'")
		if (result.rows.length === 0) {
			await pool.query('CREATE SCHEMA "auth"')
			log.info('Schema "auth" created.')
		} else {
			log.info('Schema "auth" already exists.')
		}
	} finally {
		await pool.end()
	}
}

function runBetterAuthMigrate(): void {
	log.info("Running Better Auth migration...")
	// The better-auth CLI discovers auth config from the project it runs in.
	// Run from apps/web/ where auth.ts lives.
	const webAppDir = resolve(__dirname, "..", "..", "..", "apps", "web")
	execSync("pnpx @better-auth/cli migrate --yes", {
		stdio: "inherit",
		env: process.env,
		cwd: webAppDir,
	})
}

async function main(): Promise<void> {
	loadEnv()
	await ensureAuthSchema()
	runBetterAuthMigrate()
	log.info("Auth migration completed.")
}

main().catch((err: unknown) => {
	log.error("Auth migration failed", { error: err instanceof Error ? err.message : String(err) })
	process.exit(1)
})
