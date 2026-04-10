import type { EvalConfig, EvalResults, MemoryInterface } from "./types.js"

/**
 * Run evaluation on a memory system using the provided test cases.
 * Computes recall, precision, and F1 for retrieval effectiveness.
 */
export async function evaluateMemory(memory: MemoryInterface, config: EvalConfig): Promise<EvalResults> {
	const cases: EvalResults["cases"] = []

	for (const testCase of config.testCases) {
		const { context, ids: retrievedIds } = await memory.loadContext(testCase.query)

		const expectedIds = new Set(testCase.expectedIds)
		const retrievedSet = new Set(retrievedIds)

		// Recall: fraction of expected IDs retrieved
		const truePositives = [...expectedIds].filter((id) => retrievedSet.has(id)).length
		const recall = expectedIds.size > 0 ? truePositives / expectedIds.size : 0

		// Precision: fraction of retrieved IDs that are expected
		const precision = retrievedIds.length > 0 ? truePositives / retrievedIds.length : 0

		// F1 score
		const f1 = recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0

		cases.push({
			query: testCase.query,
			recall,
			precision,
			f1,
			retrievedIds,
			retrievedContext: context,
		})
	}

	// Aggregate metrics
	const avgRecall = cases.reduce((sum, c) => sum + c.recall, 0) / cases.length
	const avgPrecision = cases.reduce((sum, c) => sum + c.precision, 0) / cases.length
	const avgF1 = cases.reduce((sum, c) => sum + c.f1, 0) / cases.length

	return {
		metrics: { avgRecall, avgPrecision, avgF1 },
		cases,
	}
}

/**
 * Utility to compute individual metrics for a single test case.
 * Useful for custom evaluations.
 */
export function computeMetrics(expectedIds: string[], retrievedIds: string[]) {
	const expectedSet = new Set(expectedIds)
	const retrievedSet = new Set(retrievedIds)

	const truePositives = [...expectedSet].filter((id) => retrievedSet.has(id)).length
	const recall = expectedSet.size > 0 ? truePositives / expectedSet.size : 0
	const precision = retrievedIds.length > 0 ? truePositives / retrievedIds.length : 0
	const f1 = recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0

	return { recall, precision, f1, truePositives }
}
