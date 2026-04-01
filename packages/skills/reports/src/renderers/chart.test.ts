import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderChart } from "./chart.js"

describe("renderChart", () => {
	it("renders a bar chart and returns a Buffer with PNG magic bytes", async () => {
		const buf = await renderChart({
			type: "bar",
			title: "Test Bar Chart",
			labels: ["Jan", "Feb", "Mar"],
			datasets: [
				{
					label: "Sessions",
					data: [10, 20, 15],
					backgroundColor: "rgba(54, 162, 235, 0.5)",
				},
			],
		})

		assert.ok(buf instanceof Buffer, "result should be a Buffer")
		// PNG magic bytes: \x89PNG
		assert.equal(buf[0], 0x89)
		assert.equal(buf[1], 0x50) // P
		assert.equal(buf[2], 0x4e) // N
		assert.equal(buf[3], 0x47) // G
	})

	it("renders a line chart", async () => {
		const buf = await renderChart({
			type: "line",
			title: "Line Chart",
			labels: ["Q1", "Q2"],
			datasets: [{ label: "Value", data: [5, 10] }],
		})
		assert.ok(buf instanceof Buffer)
		assert.ok(buf.length > 0)
	})

	it("renders a pie chart", async () => {
		const buf = await renderChart({
			type: "pie",
			title: "Pie Chart",
			labels: ["A", "B"],
			datasets: [{ label: "Share", data: [60, 40] }],
		})
		assert.ok(buf instanceof Buffer)
		assert.ok(buf.length > 0)
	})
})
