import { jsonFormatter } from "./formatters/json.js"
import { textFormatter } from "./formatters/text.js"
import { type LogLevel, resolveLogLevel, shouldLog } from "./levels.js"
import type { LogFormatter, Logger, LoggerConfig } from "./types.js"

/**
 * Select the default formatter based on NODE_ENV.
 * Text for development (human-readable), JSON for production (machine-parseable).
 */
const defaultFormatter = (): LogFormatter => {
	const nodeEnv = typeof process !== "undefined" ? process.env?.NODE_ENV : undefined
	return nodeEnv === "production" ? jsonFormatter : textFormatter
}

/**
 * Write a formatted log line to the appropriate output stream.
 * error and fatal go to stderr; everything else goes to stdout.
 */
const writeLine = (level: LogLevel, line: string): void => {
	if (level === "error" || level === "fatal") {
		process.stderr.write(`${line}\n`)
	} else {
		process.stdout.write(`${line}\n`)
	}
}

/**
 * Create a logger instance.
 *
 * @param config.component  Name of the component (e.g. "gateway", "orchestrator").
 * @param config.level      Minimum log level. Defaults to LOG_LEVEL env var.
 * @param config.formatter  Output formatter. Defaults to text in dev, JSON in prod.
 *
 * @example
 * ```ts
 * const log = createLogger({ component: "gateway" })
 * log.info("Server started", { port: 4000 })
 * // [2026-03-26T10:00:00.000Z] INFO  [gateway] Server started port=4000
 *
 * const reqLog = log.child({ requestId: "abc-123" })
 * reqLog.error("Request failed", { status: 500 })
 * // [2026-03-26T10:00:01.000Z] ERROR [gateway] Request failed requestId=abc-123 status=500
 * ```
 */
export const createLogger = (config: LoggerConfig, parentContext?: Record<string, unknown>): Logger => {
	const minLevel = config.level ?? resolveLogLevel()
	const formatter = config.formatter ?? defaultFormatter()
	const baseContext = parentContext ?? {}

	const emit = (level: LogLevel, message: string, data?: Record<string, unknown>): void => {
		if (!shouldLog(level, minLevel)) return
		const entry = {
			level,
			message,
			component: config.component,
			timestamp: new Date().toISOString(),
			data: { ...baseContext, ...data },
		}
		writeLine(level, formatter.format(entry))
	}

	return {
		debug: (message, data) => emit("debug", message, data),
		info: (message, data) => emit("info", message, data),
		warn: (message, data) => emit("warn", message, data),
		error: (message, data) => emit("error", message, data),
		fatal: (message, data) => emit("fatal", message, data),
		child: (context) =>
			createLogger({ component: config.component, level: minLevel, formatter }, { ...baseContext, ...context }),
	}
}
