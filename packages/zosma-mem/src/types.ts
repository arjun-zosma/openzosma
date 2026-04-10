// Engine types
export type MemoryEventType = "decision" | "error" | "pattern" | "preference"

export interface MemoryEvent {
	id: string
	type: MemoryEventType
	content: string
	tags: string[]
	attentionWeight?: number
	metadata?: {
		file?: string
		module?: string
		relatedMemories?: string[]
		branch?: string
		commitRef?: string
	}
	timestamp: number
}

export interface MemoryScore {
	reuseCount: number
	decisionInfluence: number
	ignoredReads: number
	lastAccessed: number
	attentionWeight: number
	belowThresholdCycles: number
}

export interface MemoryEntity {
	id: string
	source: { branch: string; commitRef: string }
	score: MemoryScore
	tags: string[]
	content: string
}

export interface MemoryConfig {
	memoryDir: string
	salienceThreshold?: number
	gcIntervalMs?: number
	gcPruneCycles?: number
	summarizer?: Summarizer
	now?: () => number
}

export type Summarizer = (texts: string[]) => Promise<string>

export interface AttentionQuery {
	taskDescription: string
	activeToolName?: string
	intent?: string
}

export interface ScoredEntity {
	entity: MemoryEntity
	attentionScore: number
}

export interface GcReport {
	decayed: number
	pruned: number
	consolidated: number
}

export interface MemoryEngine {
	ingest: (event: MemoryEvent) => Promise<void>
	retrieve: (query: AttentionQuery, topK?: number) => Promise<ScoredEntity[]>
	recordRead: (entityId: string) => Promise<void>
	recordIgnoredRead: (entityId: string) => Promise<void>
	recordDecisionInfluence: (entityId: string) => Promise<void>
	gc: () => Promise<GcReport>
	shutdown: () => void
	/** Return all persisted entity IDs (used by the eval adapter). */
	listEntities: () => Promise<string[]>
}
