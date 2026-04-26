import { computeSalience } from "../engine/salience.js"
import type { CoAccessGraph } from "../store/co-access.js"
import { recordCoAccess } from "../store/co-access.js"
import type { EntityStore } from "../store/entity-store.js"
import type { AttentionQuery, MemoryConfig, ScoredEntity } from "../types.js"

/**
 * Attention score:
 *   A(q, e) = 3*taskOverlap(q, e) + 5*intentOverlap(q, e) + S(e) + coAccessBoost(e)
 *
 * taskOverlap  — entity tags appearing in the query's task description text
 * intentOverlap — entity tags matching explicit intent/hint tags (higher weight)
 *
 * Two-pass retrieval:
 *   Pass 1: score all entities by tagOverlap + salience, take top 2K candidates
 *   Pass 2: add coAccessBoost among candidates, re-sort, return top K
 */
export const retrieve = (
	query: AttentionQuery,
	store: EntityStore,
	coAccess: CoAccessGraph,
	config: Pick<MemoryConfig, "now">,
	topK = 5,
): ScoredEntity[] => {
	const nowFn = config.now ?? Date.now
	const taskTerms = new Set(
		query.taskDescription
			.toLowerCase()
			.split(/\s+/)
			.map((t) => t.replace(/[^a-z0-9]/g, ""))
			.filter((t) => t.length > 0),
	)
	// Intent tags (e.g. ["auth", "session"]) get a higher weight — they are
	// explicit signals about what the agent is working on right now.
	const intentTags: Set<string> = query.intent
		? new Set(
				query.intent
					.toLowerCase()
					.split(/\s+/)
					.filter((t) => t.length > 0),
			)
		: new Set()

	const ids = store.list()
	if (ids.length === 0) return []

	// Pass 1: base score
	const candidates = ids
		.map((id) => {
			const entity = store.read(id)
			if (!entity) return null
			const taskOverlap = entity.tags.filter((t) => taskTerms.has(t.toLowerCase())).length
			const intentOverlap = intentTags.size > 0 ? entity.tags.filter((t) => intentTags.has(t.toLowerCase())).length : 0
			const salience = computeSalience(entity.score, nowFn)

			// Context isolation: when intent tags are provided and the entity has
			// zero overlap with both task terms AND intent tags, it is irrelevant to
			// this query. Penalize it to prevent high-salience entities from leaking
			// across context boundaries.
			if (intentTags.size > 0 && taskOverlap === 0 && intentOverlap === 0) {
				// Cap at a small negative value — ensures any entity with even one
				// tag match outranks a high-salience but contextually irrelevant entity.
				return { entity, baseScore: Math.min(salience * 0.05, -1) }
			}

			return { entity, baseScore: 3 * taskOverlap + 5 * intentOverlap + salience }
		})
		.filter(Boolean) as Array<{
		entity: NonNullable<ReturnType<EntityStore["read"]>>
		baseScore: number
	}>

	candidates.sort((a, b) => b.baseScore - a.baseScore)
	const pool = candidates.slice(0, Math.max(topK * 2, 10))
	const poolIds = new Set(pool.map((c) => c.entity.id))

	// Pass 2: co-access boost
	const scored: ScoredEntity[] = pool.map(({ entity, baseScore }) => {
		const coBoost = (coAccess[entity.id] ?? []).some((coId) => poolIds.has(coId)) ? 1 : 0
		return { entity, attentionScore: baseScore + coBoost }
	})

	scored.sort((a, b) => b.attentionScore - a.attentionScore)
	const results = scored.slice(0, topK)

	// Update co-access graph with this retrieval session
	if (results.length > 1) {
		const updatedGraph = recordCoAccess(
			coAccess,
			results.map((r) => r.entity.id),
		)
		Object.assign(coAccess, updatedGraph)
	}

	return results
}
