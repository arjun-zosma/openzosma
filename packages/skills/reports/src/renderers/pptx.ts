import { createRequire } from "node:module"
import type { MonthlyReportData, RenderOpts } from "../templates/types.js"
import { renderChart } from "./chart.js"

const require = createRequire(import.meta.url)
// pptxgenjs ships a CJS bundle; load it via require to get the constructor
const PptxGenJS = require("pptxgenjs") as new () => {
	layout: string
	addSlide(): {
		addText(text: string, opts: object): void
		addTable(rows: object[], opts: object): void
		addImage(opts: object): void
	}
	write(opts: { outputType: string }): Promise<unknown>
}

/** Build a sessions overview chart spec from report data. */
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
 * Render MonthlyReportData to a PowerPoint (PPTX) buffer using pptxgenjs.
 *
 * Slide layout:
 *   1. Title slide — report title + period
 *   2. Summary metrics slide — label/value table
 *   3. Sessions overview chart slide — embedded PNG
 *   4. Session breakdown table slide
 *
 * @param data - The monthly report data to render.
 * @param opts - Optional render options (format, outputPath).
 * @returns A Buffer containing the PPTX binary content.
 */
export const renderPptx = async (data: MonthlyReportData, _opts?: RenderOpts): Promise<Buffer> => {
	const pptx = new PptxGenJS()
	pptx.layout = "LAYOUT_16x9"

	// --- Slide 1: Title ---
	const titleSlide = pptx.addSlide()
	titleSlide.addText("Monthly Report", {
		x: 0.5,
		y: 1.5,
		w: 9,
		h: 1.2,
		fontSize: 36,
		bold: true,
		align: "center",
	})
	titleSlide.addText(data.period, {
		x: 0.5,
		y: 2.9,
		w: 9,
		h: 0.7,
		fontSize: 24,
		align: "center",
		color: "555555",
	})

	// --- Slide 2: Summary Metrics ---
	const metricsSlide = pptx.addSlide()
	metricsSlide.addText("Summary Metrics", {
		x: 0.5,
		y: 0.3,
		w: 9,
		h: 0.6,
		fontSize: 20,
		bold: true,
	})
	metricsSlide.addTable(
		[
			[
				{ text: "Label", options: { bold: true } },
				{ text: "Value", options: { bold: true } },
			],
			[{ text: "Period" }, { text: data.period }],
			[{ text: "Total Sessions" }, { text: String(data.totalSessions) }],
			[{ text: "Total Messages" }, { text: String(data.totalMessages) }],
			[{ text: "Total Tool Calls" }, { text: String(data.totalToolCalls) }],
		],
		{ x: 0.5, y: 1.1, w: 9, colW: [4.5, 4.5], fontSize: 14 },
	)

	// --- Slide 3: Chart ---
	const chartBuf = await renderChart(buildSessionsChartSpec(data))
	const chartBase64 = chartBuf.toString("base64")

	const chartSlide = pptx.addSlide()
	chartSlide.addText("Sessions Overview", {
		x: 0.5,
		y: 0.3,
		w: 9,
		h: 0.6,
		fontSize: 20,
		bold: true,
	})
	chartSlide.addImage({
		data: `image/png;base64,${chartBase64}`,
		x: 0.5,
		y: 1.1,
		w: 9,
		h: 4.5,
	})

	// --- Slide 4: Session Breakdown Table ---
	const tableSlide = pptx.addSlide()
	tableSlide.addText("Session Breakdown", {
		x: 0.5,
		y: 0.3,
		w: 9,
		h: 0.6,
		fontSize: 20,
		bold: true,
	})

	type TableRow = { text?: string; options?: { bold?: boolean } }[]
	const tableRows: TableRow[] = [
		[
			{ text: "Session ID", options: { bold: true } },
			{ text: "Messages", options: { bold: true } },
			{ text: "Tool Calls", options: { bold: true } },
			{ text: "Duration (s)", options: { bold: true } },
		],
		...data.sessions.map(
			(s): TableRow => [
				{ text: s.sessionId },
				{ text: String(s.messageCount) },
				{ text: String(s.toolCallCount) },
				{ text: String(s.durationSeconds) },
			],
		),
	]

	tableSlide.addTable(tableRows, {
		x: 0.5,
		y: 1.1,
		w: 9,
		colW: [2.5, 2, 2, 2.5],
		fontSize: 12,
	})

	const result = await pptx.write({ outputType: "nodebuffer" })
	return result as Buffer
}
