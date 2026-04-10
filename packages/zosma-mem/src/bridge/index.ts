export { resolveMemoryExtensionPaths } from "./extensions.js"

/**
 * MemoryBridge — integration layer between zosma-mem engine and the agent session lifecycle.
 *
 * Responsibilities:
 * - Retrieve relevant memories at the start of each turn and format them for system prompt injection
 * - Accept extracted facts and ingest them into the salience engine
 * - Track reinforcement signals (used / ignored / influenced_decision)
 * - Run GC on demand or on session shutdown
 *
 * The bridge deliberately does NOT call the LLM for extraction. That is the caller's
 * responsibility (packages/agents/src/pi/memory.ts). This keeps @openzosma/zosma-mem
 * free of the @mariozechner/pi-ai dependency and testable without an API key.
 */

import { createHash } from "node:crypto"
import { createMemoryEngine } from "../engine/factory.js"
import type { MemoryEngine, MemoryEventType } from "../types.js"

export interface ExtractedFact {
	/** Human-readable statement of the fact, e.g. "User's favorite animal is elephant" */
	content: string
	/** Semantic type of the fact */
	type: MemoryEventType
	/** Short lowercase keywords for retrieval matching */
	tags: string[]
}

export interface BridgeConfig {
	/** Stable per-agent-config memory directory */
	memoryDir: string
	/** Minimum salience score to keep during GC. Default: engine default */
	salienceThreshold?: number
	/** How many memories to retrieve per turn. Default: 8 */
	topK?: number
}

export interface MemoryBridge {
	/**
	 * Retrieve memories relevant to the current user message and format them
	 * as a system prompt section. Returns an empty string when no memories exist.
	 */
	loadContext: (
		userMessage: string,
	) => Promise<{ context: string; ids: string[]; entities: Array<{ id: string; content: string }> }>

	/**
	 * Ingest a batch of already-extracted facts into the salience engine.
	 * Called by the agent after each turn with facts extracted from the conversation.
	 */
	ingestFacts: (facts: ExtractedFact[]) => Promise<void>

	/**
	 * Record a reinforcement signal for a retrieved memory entity.
	 * Call with "used" when the agent references a memory in its response.
	 * Call with "ignored" when a retrieved memory had no visible effect.
	 * Call with "influenced_decision" when the memory directly shaped a tool call or decision.
	 */
	recordUsage: (entityId: string, signal: "used" | "ignored" | "influenced_decision") => Promise<void>

	/** Run garbage collection — decay + prune low-salience entities. */
	gc: () => Promise<void>

	/** Shutdown: clear GC timer. Call on session end. */
	shutdown: () => void

	/** Return all entity IDs currently in the store (for testing). */
	listEntityIds: () => Promise<string[]>
}

/**
 * Stable deterministic ID for a fact. If the same fact is extracted again
 * it hashes to the same ID, so the engine deduplicates it by updating in place.
 */
export const factId = (content: string): string =>
	createHash("sha256").update(content.trim().toLowerCase().replace(/\s+/g, " ")).digest("hex").slice(0, 16)

/**
 * Format retrieved memories as a system prompt section.
 */
const formatContext = (memories: Array<{ id: string; content: string; score: number }>): string => {
	if (memories.length === 0) return ""

	const lines = [
		"## Long-term Memory",
		"",
		"The following facts have been remembered from previous conversations with this user.",
		"Use them to inform your responses naturally, without mentioning memory IDs or scores.",
		"",
		...memories.map((m) => `- ${m.content}`),
		"",
	]

	return lines.join("\n")
}

/**
 * Create a MemoryBridge backed by the zosma-mem salience engine.
 */
export const createMemoryBridge = (config: BridgeConfig): MemoryBridge => {
	const engine: MemoryEngine = createMemoryEngine({
		memoryDir: config.memoryDir,
		salienceThreshold: config.salienceThreshold,
		// GC every 5 minutes in production. Tests override via config.
		gcIntervalMs: 5 * 60 * 1000,
		gcPruneCycles: 2,
	})

	const topK = config.topK ?? 8

	const loadContext = async (
		userMessage: string,
	): Promise<{ context: string; ids: string[]; entities: Array<{ id: string; content: string }> }> => {
		const results = await engine.retrieve({ taskDescription: userMessage }, topK)

		if (results.length === 0) return { context: "", ids: [], entities: [] }

		const memories = results.map((r) => ({
			id: r.entity.id,
			content: r.entity.content,
			score: r.attentionScore,
		}))

		// Record ignored reads for entities that scored below threshold
		// (returned in results but likely not relevant). The low score is the signal.
		for (const r of results) {
			if (r.attentionScore < 1) {
				await engine.recordIgnoredRead(r.entity.id)
			}
		}

		const ids = memories.map((m) => m.id)
		const entities = memories.map((m) => ({ id: m.id, content: m.content }))
		return { context: formatContext(memories), ids, entities }
	}

	const ingestFacts = async (facts: ExtractedFact[]): Promise<void> => {
		const now = Date.now()
		for (const fact of facts) {
			await engine.ingest({
				id: factId(fact.content),
				type: fact.type,
				content: fact.content,
				tags: fact.tags,
				timestamp: now,
			})
		}
	}

	const recordUsage = async (entityId: string, signal: "used" | "ignored" | "influenced_decision"): Promise<void> => {
		if (signal === "used") {
			await engine.recordRead(entityId)
		} else if (signal === "ignored") {
			await engine.recordIgnoredRead(entityId)
		} else {
			await engine.recordDecisionInfluence(entityId)
		}
	}

	const gc = async (): Promise<void> => {
		await engine.gc()
	}

	const shutdown = (): void => {
		engine.shutdown()
	}

	const listEntityIds = async (): Promise<string[]> => engine.listEntities()

	return { loadContext, ingestFacts, recordUsage, gc, shutdown, listEntityIds }
}
