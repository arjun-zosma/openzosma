/**
 * Supported log levels, ordered by ascending severity.
 *
 * - debug: Verbose diagnostics (suppressed in production by default)
 * - info:  Normal operational messages
 * - warn:  Non-fatal issues that may need attention
 * - error: Failures that affect a single operation
 * - fatal: Unrecoverable failures (process should exit)
 * - silent: Suppresses all output
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal" | "silent"

/** Numeric severity for each level. Higher = more severe. */
export const SEVERITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	fatal: 4,
	silent: 5,
}

/**
 * Returns true if a message at `messageLevel` should be emitted
 * given the configured `minLevel` threshold.
 */
export const shouldLog = (messageLevel: LogLevel, minLevel: LogLevel): boolean =>
	SEVERITY[messageLevel] >= SEVERITY[minLevel]

/** Uppercase label for display. */
export const LEVEL_LABELS: Record<LogLevel, string> = {
	debug: "DEBUG",
	info: "INFO",
	warn: "WARN",
	error: "ERROR",
	fatal: "FATAL",
	silent: "",
}

/**
 * Resolve the effective log level from the LOG_LEVEL environment variable.
 * Falls back to "debug" in development and "info" in production.
 */
export const resolveLogLevel = (): LogLevel => {
	const env = (typeof process !== "undefined" ? process.env?.LOG_LEVEL : undefined) as string | undefined
	if (env && env in SEVERITY) return env as LogLevel
	const nodeEnv = typeof process !== "undefined" ? process.env?.NODE_ENV : undefined
	return nodeEnv === "production" ? "info" : "debug"
}
