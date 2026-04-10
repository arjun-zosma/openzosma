import type { MemoryScore } from "../types.js"

/**
 * Compute the salience score for a memory entity.
 * S(e) = 2*reuseCount + 5*decisionInfluence - 2*ignoredReads - ln(1 + ageDays)
 * ageDays is computed from lastAccessed using the injectable now().
 */
export const computeSalience = (score: MemoryScore, now: () => number = Date.now): number => {
	const ageDays = (now() - score.lastAccessed) / 86_400_000
	const decay = Math.log(1 + ageDays)
	return 2 * score.reuseCount + 5 * score.decisionInfluence - 2 * score.ignoredReads - decay
}

export const meetsThreshold = (salience: number, threshold: number): boolean => salience >= threshold

export const initialScore = (eventType: string, now: () => number = Date.now): MemoryScore => ({
	reuseCount: 0,
	decisionInfluence: eventType === "decision" ? 1 : 0,
	ignoredReads: 0,
	lastAccessed: now(),
	attentionWeight: eventType === "decision" ? 1.0 : 0.0,
	belowThresholdCycles: 0,
})
