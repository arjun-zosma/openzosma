import type { MonthlyReportData } from "../templates/types.js"

/**
 * Escape a single CSV field value.
 * Wraps in double-quotes if the value contains a comma, newline, or double-quote.
 * Inner double-quotes are escaped as "".
 */
const escapeCsvField = (value: string): string => {
	if (value.includes(",") || value.includes("\n") || value.includes('"')) {
		return `"${value.replace(/"/g, '""')}"`
	}
	return value
}

/**
 * Render a 2D array of string rows as a CSV block.
 */
const renderTable = (headers: string[], rows: string[][]): string => {
	const lines: string[] = [headers.map(escapeCsvField).join(",")]
	for (const row of rows) {
		lines.push(row.map(escapeCsvField).join(","))
	}
	return lines.join("\n")
}

/**
 * Render MonthlyReportData to a CSV buffer.
 *
 * Outputs two tables separated by a blank line:
 * 1. Summary metrics (label, value)
 * 2. Per-session breakdown
 *
 * @param data - The monthly report data to render.
 * @returns A Buffer containing the UTF-8 encoded CSV content.
 */
export const renderCsv = async (data: MonthlyReportData): Promise<Buffer> => {
	const sections: string[] = []

	// Summary table
	sections.push(
		renderTable(
			["label", "value"],
			[
				["period", data.period],
				["totalSessions", String(data.totalSessions)],
				["totalMessages", String(data.totalMessages)],
				["totalToolCalls", String(data.totalToolCalls)],
			],
		),
	)

	// Sessions table
	sections.push(
		renderTable(
			["sessionId", "messageCount", "toolCallCount", "durationSeconds"],
			data.sessions.map((s) => [
				s.sessionId,
				String(s.messageCount),
				String(s.toolCallCount),
				String(s.durationSeconds),
			]),
		),
	)

	return Buffer.from(sections.join("\n\n"), "utf-8")
}
