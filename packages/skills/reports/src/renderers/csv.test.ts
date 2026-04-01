import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { MonthlyReportData } from "../templates/types.js"
import { renderCsv } from "./csv.js"

const baseData: MonthlyReportData = {
	period: "March 2026",
	totalSessions: 2,
	totalMessages: 30,
	totalToolCalls: 10,
	sessions: [
		{ sessionId: "s1", messageCount: 15, toolCallCount: 5, durationSeconds: 120 },
		{ sessionId: "s2", messageCount: 15, toolCallCount: 5, durationSeconds: 90 },
	],
}

describe("renderCsv", () => {
	it("returns a Buffer", async () => {
		const buf = await renderCsv(baseData)
		assert.ok(buf instanceof Buffer)
		assert.ok(buf.length > 0)
	})

	it("contains correct summary headers and values", async () => {
		const buf = await renderCsv(baseData)
		const text = buf.toString("utf-8")
		assert.ok(text.includes("label,value"))
		assert.ok(text.includes("period,March 2026"))
		assert.ok(text.includes("totalSessions,2"))
	})

	it("contains session table headers and session rows", async () => {
		const buf = await renderCsv(baseData)
		const text = buf.toString("utf-8")
		assert.ok(text.includes("sessionId,messageCount,toolCallCount,durationSeconds"))
		assert.ok(text.includes("s1,15,5,120"))
		assert.ok(text.includes("s2,15,5,90"))
	})

	it("tables are separated by a blank line", async () => {
		const buf = await renderCsv(baseData)
		const text = buf.toString("utf-8")
		assert.ok(text.includes("\n\n"))
	})

	it("escapes fields containing commas", async () => {
		const data: MonthlyReportData = {
			...baseData,
			period: "Jan, Feb 2026",
		}
		const buf = await renderCsv(data)
		const text = buf.toString("utf-8")
		assert.ok(text.includes('"Jan, Feb 2026"'))
	})

	it("escapes fields containing double-quotes", async () => {
		const data: MonthlyReportData = {
			...baseData,
			period: 'He said "hello"',
		}
		const buf = await renderCsv(data)
		const text = buf.toString("utf-8")
		assert.ok(text.includes('"He said ""hello"""'))
	})

	it("escapes fields containing newlines", async () => {
		const data: MonthlyReportData = {
			...baseData,
			period: "line1\nline2",
		}
		const buf = await renderCsv(data)
		const text = buf.toString("utf-8")
		assert.ok(text.includes('"line1\nline2"'))
	})
})
