import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { EntityStore } from "../../store/entity-store.js"
import type { MemoryEntity } from "../../types.js"
import { decayAll } from "../decay.js"
import { runGc } from "../index.js"
import { pruneBelow } from "../prune.js"

const NOW = 1_000_000_000_000
const DAY_MS = 86_400_000

const makeEntity = (
	id: string,
	lastAccessedOffset = 0,
	reuseCount = 0,
	decisionInfluence = 0,
	belowThresholdCycles = 0,
): MemoryEntity => ({
	id,
	source: { branch: "main", commitRef: "0" },
	score: {
		reuseCount,
		decisionInfluence,
		ignoredReads: 0,
		lastAccessed: NOW - lastAccessedOffset,
		attentionWeight: 0,
		belowThresholdCycles,
	},
	tags: [],
	content: `content ${id}`,
})

const makeStore = (...entities: MemoryEntity[]): EntityStore => {
	const dir = mkdtempSync(join(tmpdir(), "gc-test-"))
	const store = new EntityStore(dir)
	store.ensureDir()
	for (const e of entities) store.write(e)
	return store
}

describe("decayAll", () => {
	it("entity with 30-day-old lastAccessed gets lower attentionWeight than fresh entity", () => {
		const fresh = makeEntity("fresh", 0)
		const stale = makeEntity("stale", 30 * DAY_MS)
		const store = makeStore(fresh, stale)
		decayAll(store, () => NOW)
		const freshUpdated = store.read("fresh")!
		const staleUpdated = store.read("stale")!
		expect(freshUpdated.score.attentionWeight).toBeGreaterThanOrEqual(staleUpdated.score.attentionWeight)
	})
})

describe("pruneBelow", () => {
	it("entity below threshold for pruneCycles is archived", () => {
		// salience: 2*0 + 5*0 - 2*0 - ln(1+100) ≈ -4.6 → below 0.4
		const entity = makeEntity("old", 100 * DAY_MS, 0, 0, 2) // belowThresholdCycles=2, pruneCycles=3
		const store = makeStore(entity)
		const pruned = pruneBelow(store, 0.4, 3, () => NOW)
		expect(pruned).toBe(1)
		expect(store.read("old")).toBeUndefined()
	})

	it("entity below threshold for fewer than pruneCycles cycles is NOT archived", () => {
		const entity = makeEntity("young-stale", 50 * DAY_MS, 0, 0, 0)
		const store = makeStore(entity)
		const pruned = pruneBelow(store, 0.4, 3, () => NOW)
		expect(pruned).toBe(0)
		const updated = store.read("young-stale")!
		expect(updated.score.belowThresholdCycles).toBe(1)
	})
})

describe("runGc", () => {
	it("integrates decay and prune, returns correct report", () => {
		// fresh: reuseCount=5, decisionInfluence=2 → salience = 10+10 - ln(1) = 20 → above threshold
		const fresh = makeEntity("fresh", 0, 5, 2)
		// stale: below threshold for 2 cycles already, third cycle archives it
		const stale = makeEntity("stale", 100 * DAY_MS, 0, 0, 2)
		const store = makeStore(fresh, stale)
		const coAccess = {}
		const config = {
			memoryDir: "",
			salienceThreshold: 0.4,
			gcIntervalMs: 0,
			gcPruneCycles: 3,
			summarizer: undefined,
			now: undefined,
		}
		const report = runGc(store, coAccess, config, () => NOW)
		expect(report.decayed).toBe(2)
		expect(report.pruned).toBe(1)
		expect(report.consolidated).toBe(0)
	})
})
