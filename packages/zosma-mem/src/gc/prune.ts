import { computeSalience } from "../engine/salience.js"
import type { EntityStore } from "../store/entity-store.js"

/** Archive entities that have been below threshold for gcPruneCycles consecutive cycles. */
export const pruneBelow = (store: EntityStore, threshold: number, pruneCycles: number, now: () => number): number => {
	const ids = store.list()
	let pruned = 0
	for (const id of ids) {
		const entity = store.read(id)
		if (!entity) continue
		const salience = computeSalience(entity.score, now)
		if (salience < threshold) {
			const cycles = entity.score.belowThresholdCycles + 1
			if (cycles >= pruneCycles) {
				store.archive(id)
				pruned++
			} else {
				store.write({ ...entity, score: { ...entity.score, belowThresholdCycles: cycles } })
			}
		} else {
			if (entity.score.belowThresholdCycles > 0) {
				store.write({ ...entity, score: { ...entity.score, belowThresholdCycles: 0 } })
			}
		}
	}
	return pruned
}
