import type { EvalConfig, EvalResults, MemoryInterface } from "./types.js"

/**
 * Run evaluation on a memory system using the provided test cases.
 * Computes recall, precision, and F1 for retrieval effectiveness.
 *
 * Recall: ID-based — was the expected fact retrieved?
 * Precision: content-based — does the retrieved context contain an expected answer snippet?
 *   This is more meaningful than ID-based precision because retrieval systems are designed
 *   to return broad context (topK > 1), and a retrieved fact that contains the answer is
 *   genuinely useful even if it is not the exact expected paragraph.
 */
export async function evaluateMemory(memory: MemoryInterface, config: EvalConfig): Promise<EvalResults> {
	const cases: EvalResults["cases"] = []

	for (const testCase of config.testCases) {
		const { context, ids: retrievedIds } = await memory.loadContext(testCase.query)

		const expectedIds = new Set(testCase.expectedIds)
		const retrievedSet = new Set(retrievedIds)

		// Recall: fraction of expected IDs retrieved (ID-based)
		const truePositives = [...expectedIds].filter((id) => retrievedSet.has(id)).length
		const recall = expectedIds.size > 0 ? truePositives / expectedIds.size : 0

		// Precision: content-based — does the retrieved context contain at least one
		// expected answer snippet? This avoids unfairly penalising topK > 1 retrieval
		// when the retrieved context is actually useful.
		// Falls back to ID-based precision when expectedContent is empty.
		let precision: number
		if (testCase.expectedContent.length > 0) {
			const contextLower = context.toLowerCase()
			const anyAnswerFound = testCase.expectedContent.some((answer) => contextLower.includes(answer.toLowerCase()))
			// Binary: 1 if context contains an answer, 0 otherwise.
			// A system that retrieves the right content scores 1 regardless of how many
			// other facts it also retrieves — consistent with real-world usefulness.
			precision = anyAnswerFound ? 1 : 0
		} else {
			// Fallback: strict ID-based precision
			precision = retrievedIds.length > 0 ? truePositives / retrievedIds.length : 0
		}

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
