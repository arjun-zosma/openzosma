import type { CoAccessGraph } from "../store/co-access.js"
import type { EntityStore } from "../store/entity-store.js"
import type { GcReport, MemoryConfig } from "../types.js"
import { consolidateClusters } from "./consolidate.js"
import { decayAll } from "./decay.js"
import { pruneBelow } from "./prune.js"

export const runGc = (
	store: EntityStore,
	coAccess: CoAccessGraph,
	config: Required<Omit<MemoryConfig, "summarizer" | "now">> & Pick<MemoryConfig, "summarizer" | "now">,
	now: () => number,
): GcReport => {
	const decayed = decayAll(store, now)
	const pruned = pruneBelow(store, config.salienceThreshold, config.gcPruneCycles, now)
	void consolidateClusters(store, coAccess, {
		salienceThreshold: config.salienceThreshold,
		summarizer: config.summarizer,
		now: config.now,
	})
	return { decayed, pruned, consolidated: 0 }
}
