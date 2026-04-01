import ExcelJS from "exceljs"
import type { MonthlyReportData, RenderOpts } from "../templates/types.js"

/**
 * Render MonthlyReportData to an Excel (XLSX) buffer using exceljs.
 *
 * Sheet layout:
 *   - Sheet "Metrics": columns label, value (summary metrics)
 *   - Sheet "Sessions": columns sessionId, messageCount, toolCallCount, durationSeconds
 *
 * @param data - The monthly report data to render.
 * @param opts - Optional render options (format, outputPath).
 * @returns A Buffer containing the XLSX binary content.
 */
export const renderXlsx = async (data: MonthlyReportData, _opts?: RenderOpts): Promise<Buffer> => {
	const workbook = new ExcelJS.Workbook()

	// --- Sheet 1: Metrics ---
	const metricsSheet = workbook.addWorksheet("Metrics")
	metricsSheet.columns = [
		{ header: "label", key: "label", width: 24 },
		{ header: "value", key: "value", width: 20 },
		{ header: "unit", key: "unit", width: 16 },
		{ header: "change", key: "change", width: 16 },
	]
	// Style header row
	const metricsHeader = metricsSheet.getRow(1)
	metricsHeader.font = { bold: true }
	metricsHeader.commit()

	// Summary rows
	metricsSheet.addRow({ label: "period", value: data.period, unit: "", change: "" })
	metricsSheet.addRow({ label: "totalSessions", value: data.totalSessions, unit: "sessions", change: "" })
	metricsSheet.addRow({ label: "totalMessages", value: data.totalMessages, unit: "messages", change: "" })
	metricsSheet.addRow({ label: "totalToolCalls", value: data.totalToolCalls, unit: "calls", change: "" })

	// --- Sheet 2: Sessions ---
	const sessionsSheet = workbook.addWorksheet("Sessions")
	sessionsSheet.columns = [
		{ header: "sessionId", key: "sessionId", width: 28 },
		{ header: "messageCount", key: "messageCount", width: 16 },
		{ header: "toolCallCount", key: "toolCallCount", width: 16 },
		{ header: "durationSeconds", key: "durationSeconds", width: 18 },
	]
	const sessionsHeader = sessionsSheet.getRow(1)
	sessionsHeader.font = { bold: true }
	sessionsHeader.commit()

	for (const s of data.sessions) {
		sessionsSheet.addRow({
			sessionId: s.sessionId,
			messageCount: s.messageCount,
			toolCallCount: s.toolCallCount,
			durationSeconds: s.durationSeconds,
		})
	}

	const arrayBuffer = await workbook.xlsx.writeBuffer()
	return Buffer.from(arrayBuffer)
}
