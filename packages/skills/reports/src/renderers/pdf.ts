import ReactPDF from "@react-pdf/renderer"
import React from "react"
import type { MonthlyReportData, RenderOpts } from "../templates/types.js"
import { renderChart } from "./chart.js"

const { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } = ReactPDF

const styles = StyleSheet.create({
	page: {
		padding: 40,
		fontFamily: "Helvetica",
		fontSize: 11,
		color: "#222",
	},
	title: {
		fontSize: 20,
		fontFamily: "Helvetica-Bold",
		marginBottom: 4,
	},
	subtitle: {
		fontSize: 13,
		marginBottom: 16,
		color: "#555",
	},
	sectionHeading: {
		fontSize: 13,
		fontFamily: "Helvetica-Bold",
		marginBottom: 6,
		marginTop: 14,
	},
	tableRow: {
		flexDirection: "row",
		borderBottomWidth: 0.5,
		borderBottomColor: "#ccc",
		paddingVertical: 3,
	},
	tableHeader: {
		fontFamily: "Helvetica-Bold",
	},
	cell: {
		flex: 1,
	},
	chart: {
		width: 480,
		height: 240,
		marginBottom: 8,
	},
})

/** Column definitions for summary metrics. */
const METRIC_HEADERS = ["Label", "Value"]

/** Build summary metrics rows from report data. */
const metricRows = (data: MonthlyReportData): [string, string][] => [
	["Period", data.period],
	["Total Sessions", String(data.totalSessions)],
	["Total Messages", String(data.totalMessages)],
	["Total Tool Calls", String(data.totalToolCalls)],
]

/** Build a default bar chart spec from report data for the sessions overview. */
const buildSessionsChartSpec = (data: MonthlyReportData) => ({
	type: "bar" as const,
	title: "Sessions Overview",
	labels: data.sessions.map((s) => s.sessionId),
	datasets: [
		{
			label: "Messages",
			data: data.sessions.map((s) => s.messageCount),
			backgroundColor: "rgba(54, 162, 235, 0.7)",
		},
		{
			label: "Tool Calls",
			data: data.sessions.map((s) => s.toolCallCount),
			backgroundColor: "rgba(255, 99, 132, 0.7)",
		},
	],
})

/**
 * Render MonthlyReportData to a PDF buffer using @react-pdf/renderer.
 *
 * Layout:
 *   - Title + period + summary metrics table
 *   - Sessions overview chart (embedded PNG)
 *   - Per-session breakdown table
 *
 * @param data - The monthly report data to render.
 * @param opts - Optional render options (format, outputPath).
 * @returns A Buffer containing the PDF binary content.
 */
export const renderPdf = async (data: MonthlyReportData, _opts?: RenderOpts): Promise<Buffer> => {
	// Pre-render chart to PNG buffer and encode as base64 data URI
	const chartBuf = await renderChart(buildSessionsChartSpec(data))
	const chartDataUri = `data:image/png;base64,${chartBuf.toString("base64")}`

	const doc = React.createElement(
		Document,
		null,
		React.createElement(
			Page,
			{ size: "A4", style: styles.page },
			// Title
			React.createElement(Text, { style: styles.title }, "Monthly Report"),
			React.createElement(Text, { style: styles.subtitle }, data.period),
			// Summary metrics
			React.createElement(Text, { style: styles.sectionHeading }, "Summary"),
			React.createElement(
				View,
				null,
				React.createElement(
					View,
					{ style: { ...styles.tableRow, ...styles.tableHeader } },
					...METRIC_HEADERS.map((h) => React.createElement(Text, { key: h, style: styles.cell }, h)),
				),
				...metricRows(data).map(([label, value]) =>
					React.createElement(
						View,
						{ key: label, style: styles.tableRow },
						React.createElement(Text, { style: styles.cell }, label),
						React.createElement(Text, { style: styles.cell }, value),
					),
				),
			),
			// Chart section
			React.createElement(Text, { style: styles.sectionHeading }, "Sessions Overview"),
			React.createElement(Image, { src: chartDataUri, style: styles.chart }),
			// Sessions table
			React.createElement(Text, { style: styles.sectionHeading }, "Session Breakdown"),
			React.createElement(
				View,
				null,
				React.createElement(
					View,
					{ style: { ...styles.tableRow, ...styles.tableHeader } },
					...["Session ID", "Messages", "Tool Calls", "Duration (s)"].map((h) =>
						React.createElement(Text, { key: h, style: styles.cell }, h),
					),
				),
				...data.sessions.map((s) =>
					React.createElement(
						View,
						{ key: s.sessionId, style: styles.tableRow },
						React.createElement(Text, { style: styles.cell }, s.sessionId),
						React.createElement(Text, { style: styles.cell }, String(s.messageCount)),
						React.createElement(Text, { style: styles.cell }, String(s.toolCallCount)),
						React.createElement(Text, { style: styles.cell }, String(s.durationSeconds)),
					),
				),
			),
		),
	)

	return renderToBuffer(doc)
}
