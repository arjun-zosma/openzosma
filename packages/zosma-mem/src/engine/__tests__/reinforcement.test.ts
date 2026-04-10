import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { EntityStore } from "../../store/entity-store.js"
import type { MemoryEntity } from "../../types.js"
import { recordDecisionInfluence, recordIgnoredRead, recordRead } from "../reinforcement.js"

const BASE_TS = 1_000_000_000_000

const makeEntity = (id: string): MemoryEntity => ({
	id,
	source: { branch: "main", commitRef: "0" },
	score: {
		reuseCount: 0,
		decisionInfluence: 0,
		ignoredReads: 0,
		lastAccessed: BASE_TS,
		attentionWeight: 0,
		belowThresholdCycles: 0,
	},
	tags: [],
	content: "test",
})

const makeStore = (entity: MemoryEntity): EntityStore => {
	const dir = mkdtempSync(join(tmpdir(), "reinforcement-test-"))
	const store = new EntityStore(dir)
	store.ensureDir()
	store.write(entity)
	return store
}

describe("reinforcement", () => {
	it("recordRead increments reuseCount and updates lastAccessed", () => {
		const entity = makeEntity("e1")
		const store = makeStore(entity)
		const later = BASE_TS + 5000
		recordRead("e1", store, () => later)
		const updated = store.read("e1")!
		expect(updated.score.reuseCount).toBe(1)
		expect(updated.score.lastAccessed).toBe(later)
	})

	it("recordIgnoredRead increments ignoredReads and does NOT update lastAccessed", () => {
		const entity = makeEntity("e2")
		const store = makeStore(entity)
		recordIgnoredRead("e2", store)
		const updated = store.read("e2")!
		expect(updated.score.ignoredReads).toBe(1)
		expect(updated.score.lastAccessed).toBe(BASE_TS)
	})

	it("recordDecisionInfluence increments decisionInfluence and updates lastAccessed", () => {
		const entity = makeEntity("e3")
		const store = makeStore(entity)
		const later = BASE_TS + 9000
		recordDecisionInfluence("e3", store, () => later)
		const updated = store.read("e3")!
		expect(updated.score.decisionInfluence).toBe(1)
		expect(updated.score.lastAccessed).toBe(later)
	})

	it("missing entity ID is a no-op", () => {
		const entity = makeEntity("e4")
		const store = makeStore(entity)
		expect(() => recordRead("nonexistent", store)).not.toThrow()
		expect(() => recordIgnoredRead("nonexistent", store)).not.toThrow()
		expect(() => recordDecisionInfluence("nonexistent", store)).not.toThrow()
	})
})
