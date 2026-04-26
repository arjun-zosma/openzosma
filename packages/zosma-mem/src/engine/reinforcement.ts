import type { EntityStore } from "../store/entity-store.js"

/**
 * Record that an entity was retrieved and acted upon by the agent.
 * Increments reuseCount and updates lastAccessed.
 */
export const recordRead = (entityId: string, store: EntityStore, now: () => number = Date.now): void => {
	const entity = store.read(entityId)
	if (!entity) return
	store.write({
		...entity,
		score: { ...entity.score, reuseCount: entity.score.reuseCount + 1, lastAccessed: now() },
	})
}

/**
 * Record that an entity was retrieved but the agent did not act on it.
 * Increments ignoredReads.
 */
export const recordIgnoredRead = (entityId: string, store: EntityStore): void => {
	const entity = store.read(entityId)
	if (!entity) return
	store.write({ ...entity, score: { ...entity.score, ignoredReads: entity.score.ignoredReads + 1 } })
}

/**
 * Record that an entity directly influenced an agent decision or tool call.
 * Strongest reinforcement signal: increments decisionInfluence and updates lastAccessed.
 */
export const recordDecisionInfluence = (entityId: string, store: EntityStore, now: () => number = Date.now): void => {
	const entity = store.read(entityId)
	if (!entity) return
	store.write({
		...entity,
		score: {
			...entity.score,
			decisionInfluence: entity.score.decisionInfluence + 1,
			lastAccessed: now(),
		},
	})
}
