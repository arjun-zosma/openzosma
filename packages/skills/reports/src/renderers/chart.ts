import type { ChartConfiguration } from "chart.js"
import { ChartJSNodeCanvas } from "chartjs-node-canvas"

/** Supported chart types. */
export type ChartType = "bar" | "line" | "pie"

/** A single dataset for a chart. */
export interface ChartDataset {
	/** Dataset label. */
	label: string
	/** Data values. */
	data: number[]
	/** Optional background color(s). */
	backgroundColor?: string | string[]
	/** Optional border color(s). */
	borderColor?: string | string[]
}

/** Input spec for a single chart. */
export interface ChartSpec {
	/** Chart type. */
	type: ChartType
	/** Chart title. */
	title: string
	/** X-axis labels. */
	labels: string[]
	/** Datasets to plot. */
	datasets: ChartDataset[]
}

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 400

/**
 * Render a chart spec to a PNG or SVG buffer.
 *
 * @param spec - The chart spec to render.
 * @param format - Output format: 'png' (default) or 'svg'.
 * @returns A Buffer containing the rendered chart image.
 */
export const renderChart = async (spec: ChartSpec, format: "png" | "svg" = "png"): Promise<Buffer> => {
	const canvasType = format === "svg" ? "svg" : undefined
	const canvas = new ChartJSNodeCanvas({
		width: CANVAS_WIDTH,
		height: CANVAS_HEIGHT,
		type: canvasType,
		backgroundColour: "white",
	})

	const config: ChartConfiguration = {
		type: spec.type,
		data: {
			labels: spec.labels,
			datasets: spec.datasets,
		},
		options: {
			plugins: {
				title: {
					display: true,
					text: spec.title,
				},
				legend: {
					display: true,
				},
			},
			responsive: false,
		},
	}

	if (format === "svg") {
		return canvas.renderToBufferSync(config, "image/svg+xml")
	}

	return canvas.renderToBuffer(config)
}
