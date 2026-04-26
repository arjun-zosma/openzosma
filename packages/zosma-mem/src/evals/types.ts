/**
 * Agnostic evaluation interfaces for memory retrieval systems.
 * Allows any TypeScript memory implementation to be evaluated for effectiveness.
 */

/**
 * Interface that memory systems must implement to be evaluated.
 * Agnostic to the underlying storage (file-based, DB, etc.).
 */
export interface MemoryInterface {
	/**
	 * Retrieve context and entity IDs for a given query.
	 * @param query The user query string.
	 * @returns Promise resolving to retrieved context and IDs.
	 */
	loadContext(query: string): Promise<{ context: string; ids: string[] }>
}

/**
 * A test case for evaluation.
 */
export interface EvalTestCase {
	/** The query to test retrieval on. */
	query: string
	/** Expected entity IDs that should be retrieved (for recall). */
	expectedIds: string[]
	/** Expected content snippets that should appear in context (for relevance). */
	expectedContent: string[]
}

/**
 * Results of running an evaluation.
 */
export interface EvalResults {
	/** Overall metrics. */
	metrics: {
		/** Average recall across test cases (0-1). */
		avgRecall: number
		/** Average precision across test cases (0-1). */
		avgPrecision: number
		/** Average F1 score. */
		avgF1: number
	}
	/** Per-test-case results. */
	cases: Array<{
		query: string
		recall: number
		precision: number
		f1: number
		retrievedIds: string[]
		retrievedContext: string
	}>
}

/**
 * Configuration for evaluation.
 */
export interface EvalConfig {
	/** Test cases to run. */
	testCases: EvalTestCase[]
	/** Optional: Minimum salience or other thresholds. */
	options?: {
		/** Whether to check for expected content in context. */
		checkContent?: boolean
	}
}
