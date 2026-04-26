import type { CoAccessGraph } from "../store/co-access.js"
import type { EntityStore } from "../store/entity-store.js"
import type { MemoryConfig } from "../types.js"

/** Merge co-access clusters where all members are below threshold. MVP: no-op, returns 0. */
export const consolidateClusters = async (
	_store: EntityStore,
	_coAccess: CoAccessGraph,
	_config: Pick<MemoryConfig, "salienceThreshold" | "summarizer" | "now">,
): Promise<number> => {
	return 0
}
