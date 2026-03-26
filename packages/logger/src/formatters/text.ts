import { LEVEL_LABELS } from "../levels.js"
import type { LogEntry, LogFormatter } from "../types.js"

/**
 * Flatten a data object into key=value pairs for human-readable output.
 * Strings are unquoted, objects/arrays are JSON-stringified.
 */
const flattenData = (data: Record<string, unknown>): string => {
	const parts: string[] = []
	for (const [key, value] of Object.entries(data)) {
		if (value === undefined) continue
		const formatted = typeof value === "string" ? value : JSON.stringify(value)
		parts.push(`${key}=${formatted}`)
	}
	return parts.join(" ")
}

/**
 * Human-readable text formatter for development.
 *
 * Output format:
 *   [2026-03-26T10:00:00.000Z] INFO  [gateway] Server started port=4000
 */
export const textFormatter: LogFormatter = {
	format: (entry: LogEntry): string => {
		const label = LEVEL_LABELS[entry.level].padEnd(5)
		const base = `[${entry.timestamp}] ${label} [${entry.component}] ${entry.message}`
		if (entry.data && Object.keys(entry.data).length > 0) {
			return `${base} ${flattenData(entry.data)}`
		}
		return base
	},
}
