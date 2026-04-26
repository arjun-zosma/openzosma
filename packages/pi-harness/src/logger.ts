/**
 * Minimal inline logger for pi-harness.
 *
 * Replaces @openzosma/logger so pi-harness can be published as a
 * standalone package without unpublished workspace dependencies.
 */

export interface Logger {
	debug(message: string, data?: Record<string, unknown>): void
	info(message: string, data?: Record<string, unknown>): void
	warn(message: string, data?: Record<string, unknown>): void
	error(message: string, data?: Record<string, unknown>): void
	fatal(message: string, data?: Record<string, unknown>): void
	child(context: Record<string, unknown>): Logger
}

export interface LoggerConfig {
	component: string
	level?: "debug" | "info" | "warn" | "error" | "fatal"
}

const LEVELS: Record<string, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	fatal: 4,
}

function resolveLevel(): number {
	const env = process.env.LOG_LEVEL?.toLowerCase() ?? "info"
	return LEVELS[env] ?? 1
}

function formatLevel(level: string): string {
	return level.toUpperCase().padStart(5, " ")
}

function formatData(data?: Record<string, unknown>): string {
	if (!data || Object.keys(data).length === 0) return ""
	const parts = Object.entries(data).map(([k, v]) => {
		if (typeof v === "string") return `${k}="${v}"`
		return `${k}=${String(v)}`
	})
	return ` ${parts.join(" ")}`
}

export function createLogger(config: LoggerConfig, parentContext?: Record<string, unknown>): Logger {
	const minLevel = LEVELS[config.level ?? ""] ?? resolveLevel()
	const baseContext = parentContext ?? {}

	const emit = (level: string, message: string, data?: Record<string, unknown>): void => {
		if ((LEVELS[level] ?? 1) < minLevel) return
		const ts = new Date().toISOString()
		const line = `[${ts}] ${formatLevel(level)} [${config.component}] ${message}${formatData({ ...baseContext, ...data })}`
		if (level === "error" || level === "fatal") {
			process.stderr.write(`${line}\n`)
		} else {
			process.stdout.write(`${line}\n`)
		}
	}

	return {
		debug: (message, data) => emit("debug", message, data),
		info: (message, data) => emit("info", message, data),
		warn: (message, data) => emit("warn", message, data),
		error: (message, data) => emit("error", message, data),
		fatal: (message, data) => emit("fatal", message, data),
		child: (context) => createLogger(config, { ...baseContext, ...context }),
	}
}
