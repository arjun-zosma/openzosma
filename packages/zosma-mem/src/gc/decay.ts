import { computeSalience } from "../engine/salience.js"
import type { EntityStore } from "../store/entity-store.js"

/** Recompute salience for all entities. Updates score.attentionWeight. Returns count of updated entities. */
export const decayAll = (store: EntityStore, now: () => number): number => {
	const ids = store.list()
	let count = 0
	for (const id of ids) {
		const entity = store.read(id)
		if (!entity) continue
		const newSalience = computeSalience(entity.score, now)
		store.write({ ...entity, score: { ...entity.score, attentionWeight: Math.max(0, newSalience) } })
		count++
	}
	return count
}
