/**
 * Environment configuration for pi-harness.
 *
 * All settings are loaded from environment variables with sensible defaults.
 * This keeps the harness zero-config for local use while allowing full
 * customization in production deployments.
 */

export interface HarnessConfig {
	/** HTTP server port */
	port: number
	/** Host to bind to */
	host: string
	/** Optional API key for simple auth */
	apiKey: string | undefined
	/** Default workspace root directory */
	workspaceRoot: string
	/** Default LLM provider */
	defaultProvider: string | undefined
	/** Default model */
	defaultModel: string | undefined
	/** Maximum concurrent sessions (0 = unlimited) */
	maxSessions: number
	/** Session idle timeout in minutes (0 = no timeout) */
	sessionIdleTimeoutMinutes: number
	/** Whether to persist sessions to disk */
	persistSessions: boolean
	/** Directory for session persistence */
	persistenceDir: string
	/** Request body size limit in bytes */
	maxBodySize: number
	/** Default tools enabled (comma-separated, e.g. "read,bash,write") */
	defaultTools: string[] | undefined
	/** Default system prompt prefix (persona, company context) */
	defaultSystemPromptPrefix: string | undefined
	/** Default system prompt suffix (session context, integrations) */
	defaultSystemPromptSuffix: string | undefined
	/** Directory to load pi-coding-agent extensions from */
	extensionsDir: string | undefined
	/** Directory to load skills from */
	skillsDir: string | undefined
	/** Enable verbose logging */
	verbose: boolean
}

function getEnv(key: string, defaultValue?: string): string | undefined {
	return process.env[key] ?? defaultValue
}

function getEnvInt(key: string, defaultValue: number): number {
	const raw = process.env[key]
	if (!raw) return defaultValue
	const parsed = Number.parseInt(raw, 10)
	return Number.isNaN(parsed) ? defaultValue : parsed
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
	const raw = process.env[key]
	if (!raw) return defaultValue
	return raw === "1" || raw.toLowerCase() === "true"
}

/**
 * Load configuration from environment variables.
 */
export function loadConfig(): HarnessConfig {
	return {
		port: getEnvInt("PI_HARNESS_PORT", 8080),
		host: getEnv("PI_HARNESS_HOST", "0.0.0.0")!,
		apiKey: getEnv("PI_HARNESS_API_KEY"),
		workspaceRoot: getEnv("PI_HARNESS_WORKSPACE", "./workspace")!,
		defaultProvider: getEnv("PI_HARNESS_PROVIDER"),
		defaultModel: getEnv("PI_HARNESS_MODEL"),
		maxSessions: getEnvInt("PI_HARNESS_MAX_SESSIONS", 0),
		sessionIdleTimeoutMinutes: getEnvInt("PI_HARNESS_IDLE_TIMEOUT_MINUTES", 30),
		persistSessions: getEnvBool("PI_HARNESS_PERSIST", false),
		persistenceDir: getEnv("PI_HARNESS_PERSISTENCE_DIR", "./.pi-harness")!,
		maxBodySize: getEnvInt("PI_HARNESS_MAX_BODY_SIZE", 10 * 1024 * 1024), // 10MB
		defaultTools: getEnv("PI_HARNESS_TOOLS")
			?.split(",")
			.map((t) => t.trim())
			.filter(Boolean),
		defaultSystemPromptPrefix: getEnv("PI_HARNESS_SYSTEM_PROMPT_PREFIX"),
		defaultSystemPromptSuffix: getEnv("PI_HARNESS_SYSTEM_PROMPT_SUFFIX"),
		extensionsDir: getEnv("PI_HARNESS_EXTENSIONS_DIR"),
		skillsDir: getEnv("PI_HARNESS_SKILLS_DIR"),
		verbose: getEnvBool("PI_HARNESS_VERBOSE", false),
	}
}
