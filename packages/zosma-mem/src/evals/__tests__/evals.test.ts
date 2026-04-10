import { describe, expect, it, vi } from "vitest"
import { computeMetrics, evaluateMemory } from "../eval.js"
import type { EvalTestCase, MemoryInterface } from "../types.js"

describe("Memory Evaluation", () => {
	it("should compute perfect recall and precision", () => {
		const expected = ["id1", "id2"]
		const retrieved = ["id1", "id2"]
		const result = computeMetrics(expected, retrieved)
		expect(result.recall).toBe(1)
		expect(result.precision).toBe(1)
		expect(result.f1).toBe(1)
		expect(result.truePositives).toBe(2)
	})

	it("should compute zero recall for no matches", () => {
		const expected = ["id1", "id2"]
		const retrieved = ["id3", "id4"]
		const result = computeMetrics(expected, retrieved)
		expect(result.recall).toBe(0)
		expect(result.precision).toBe(0)
		expect(result.f1).toBe(0)
		expect(result.truePositives).toBe(0)
	})

	it("should handle empty expected", () => {
		const expected: string[] = []
		const retrieved = ["id1"]
		const result = computeMetrics(expected, retrieved)
		expect(result.recall).toBe(0)
		expect(result.precision).toBe(0)
		expect(result.f1).toBe(0)
	})

	it("should handle empty retrieved", () => {
		const expected = ["id1"]
		const retrieved: string[] = []
		const result = computeMetrics(expected, retrieved)
		expect(result.recall).toBe(0)
		expect(result.precision).toBe(0) // No retrieved, so precision is 0 (no true positives out of nothing)
		expect(result.f1).toBe(0)
	})

	const mockLoadContext = vi.fn()
	const mockMemory: MemoryInterface = {
		loadContext: mockLoadContext,
	}

	it("should evaluate multiple test cases", async () => {
		const testCases: EvalTestCase[] = [
			{
				query: "query1",
				expectedIds: ["id1"],
				expectedContent: [],
			},
			{
				query: "query2",
				expectedIds: ["id2", "id3"],
				expectedContent: [],
			},
		]

		// Mock responses
		mockLoadContext.mockImplementation(async (query: string) => {
			if (query === "query1") {
				return { context: "context1", ids: ["id1"] }
			}
			return { context: "context2", ids: ["id2"] }
		})

		const results = await evaluateMemory(mockMemory, { testCases })

		expect(results.metrics.avgRecall).toBe(0.75) // (1 + 0.5) / 2
		expect(results.metrics.avgPrecision).toBe(1) // (1 + 1) / 2
		expect(results.cases).toHaveLength(2)
		expect(results.cases[0].recall).toBe(1)
		expect(results.cases[1].recall).toBe(0.5)
	})

	it("should handle memory errors", async () => {
		const testCases: EvalTestCase[] = [
			{
				query: "failing query",
				expectedIds: ["id1"],
				expectedContent: [],
			},
		]

		mockLoadContext.mockRejectedValue(new Error("Memory error"))

		await expect(evaluateMemory(mockMemory, { testCases })).rejects.toThrow("Memory error")
	})
})
