import { runGc } from "../gc/index.js"
import { CommitIndexer } from "../ingestion/commit-indexer.js"
import { ingest as doIngest } from "../ingestion/ingest.js"
import { retrieve as doRetrieve } from "../retrieval/retrieve.js"
import { loadCoAccess, saveCoAccess } from "../store/co-access.js"
import { EntityStore } from "../store/entity-store.js"
import type { AttentionQuery, MemoryConfig, MemoryEngine, MemoryEvent } from "../types.js"
import { recordDecisionInfluence, recordIgnoredRead, recordRead } from "./reinforcement.js"

/**
 * Create a fully wired MemoryEngine instance.
 * This is the primary entry point for all memory operations.
 */
export const createMemoryEngine = (config: MemoryConfig): MemoryEngine => {
	const resolved = {
		memoryDir: config.memoryDir,
		salienceThreshold: config.salienceThreshold ?? 0.4,
		gcIntervalMs: config.gcIntervalMs ?? 3_600_000,
		gcPruneCycles: config.gcPruneCycles ?? 1,
		summarizer: config.summarizer,
		now: config.now,
	}
	const store = new EntityStore(resolved.memoryDir)
	store.ensureDir()

	const getNow = resolved.now ?? Date.now

	const coAccess = loadCoAccess(resolved.memoryDir)

	const indexer = new CommitIndexer({
		memoryDir: resolved.memoryDir,
		store,
		salienceConfig: { salienceThreshold: resolved.salienceThreshold, now: resolved.now },
	})

	let gcTimer: ReturnType<typeof setInterval> | undefined
	if (resolved.gcIntervalMs > 0) {
		gcTimer = setInterval(() => {
			void engine.gc()
		}, resolved.gcIntervalMs)
		gcTimer.unref?.()
	}

	const engine: MemoryEngine = {
		ingest: async (event: MemoryEvent) => {
			doIngest(event, store, { salienceThreshold: resolved.salienceThreshold, now: getNow })
		},

		reindex: async () => {
			return indexer.reindexAll()
		},

		retrieve: async (query: AttentionQuery, topK = 5) => {
			const results = doRetrieve(query, store, coAccess, { now: getNow }, topK)
			saveCoAccess(resolved.memoryDir, coAccess)
			return results
		},

		recordRead: async (entityId: string) => {
			recordRead(entityId, store, getNow)
		},

		recordIgnoredRead: async (entityId: string) => {
			recordIgnoredRead(entityId, store)
		},

		recordDecisionInfluence: async (entityId: string) => {
			recordDecisionInfluence(entityId, store, getNow)
		},

		gc: async () => {
			const report = runGc(store, coAccess, resolved, getNow)
			saveCoAccess(resolved.memoryDir, coAccess)
			return report
		},

		listEntities: async () => store.list(),

		shutdown: () => {
			if (gcTimer) clearInterval(gcTimer)
			indexer.stopWatch()
		},
	}

	return engine
}
