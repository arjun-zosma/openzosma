import type { LogLevel } from "./levels.js"

/** A single structured log entry. */
export interface LogEntry {
	/** Severity level of this entry. */
	level: LogLevel
	/** Human-readable message. */
	message: string
	/** Component that produced this entry (e.g. "gateway", "orchestrator"). */
	component: string
	/** ISO 8601 timestamp. */
	timestamp: string
	/** Optional structured context data. */
	data?: Record<string, unknown>
}

/** Converts a LogEntry into a printable string. */
export interface LogFormatter {
	format: (entry: LogEntry) => string
}

/** Configuration for creating a logger instance. */
export interface LoggerConfig {
	/** Component name prefixed on every log line. */
	component: string
	/**
	 * Minimum severity level to emit. Messages below this level are discarded.
	 * Defaults to LOG_LEVEL env var, or "debug" in dev / "info" in production.
	 */
	level?: LogLevel
	/** Output formatter. Defaults to TextFormatter in dev, JsonFormatter in production. */
	formatter?: LogFormatter
}

/** A logger instance with methods for each log level plus child logger support. */
export interface Logger {
	debug: (message: string, data?: Record<string, unknown>) => void
	info: (message: string, data?: Record<string, unknown>) => void
	warn: (message: string, data?: Record<string, unknown>) => void
	error: (message: string, data?: Record<string, unknown>) => void
	fatal: (message: string, data?: Record<string, unknown>) => void
	/**
	 * Create a child logger that inherits this logger's config and
	 * merges additional context into every log entry.
	 */
	child: (context: Record<string, unknown>) => Logger
}
