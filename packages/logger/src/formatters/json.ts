import type { LogEntry, LogFormatter } from "../types.js"

/**
 * Structured JSON formatter for production.
 *
 * Output: one JSON object per line with all fields flattened at the top level.
 *   {"level":"info","component":"gateway","message":"Server started","port":4000,"timestamp":"2026-03-26T10:00:00.000Z"}
 */
export const jsonFormatter: LogFormatter = {
	format: (entry: LogEntry): string => {
		const obj: Record<string, unknown> = {
			level: entry.level,
			component: entry.component,
			message: entry.message,
			...entry.data,
			timestamp: entry.timestamp,
		}
		return JSON.stringify(obj)
	},
}
