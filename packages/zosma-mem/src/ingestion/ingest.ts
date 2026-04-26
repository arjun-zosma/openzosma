import { initialScore } from "../engine/salience.js"
import type { EntityStore } from "../store/entity-store.js"
import type { MemoryConfig, MemoryEntity, MemoryEvent } from "../types.js"

/**
 * Ingest a MemoryEvent. Always persists (upsert). The threshold is enforced
 * during GC pruning, not at ingestion time — every event type is stored.
 *
 * Conflict resolution: when re-ingesting an existing entity with changed
 * content, `lastAccessed` is refreshed so the updated version ranks above
 * the stale version in time-sensitive queries.
 *
 * Returns true always (kept for interface compatibility).
 */
export const ingest = (
	event: MemoryEvent,
	store: EntityStore,
	config: Pick<MemoryConfig, "salienceThreshold" | "now">,
): boolean => {
	const nowFn = config.now ?? Date.now
	const existing = store.read(event.id)

	let score = existing?.score ?? initialScore(event.type, nowFn)

	// Conflict resolution: if content changed, treat the entity as freshly
	// accessed so its time-decay resets and it outranks the stale version.
	if (existing && existing.content !== event.content) {
		score = { ...score, lastAccessed: nowFn(), belowThresholdCycles: 0 }
	}

	const entity: MemoryEntity = {
		id: event.id,
		source: {
			branch: event.metadata?.branch ?? "main",
			commitRef: event.metadata?.commitRef ?? "0",
		},
		score,
		tags: event.tags,
		content: event.content,
	}

	store.write(entity)
	return true
}
