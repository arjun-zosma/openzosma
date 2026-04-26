import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { CoAccessGraph } from "../../store/co-access.js"
import { EntityStore } from "../../store/entity-store.js"
import type { MemoryEntity } from "../../types.js"
import { retrieve } from "../retrieve.js"

const NOW = 1_000_000_000_000
const nowFn = () => NOW

const makeEntity = (
	id: string,
	tags: string[],
	reuseCount = 0,
	decisionInfluence = 0,
	ignoredReads = 0,
	lastAccessed = NOW,
): MemoryEntity => ({
	id,
	source: { branch: "main", commitRef: "0" },
	score: {
		reuseCount,
		decisionInfluence,
		ignoredReads,
		lastAccessed,
		attentionWeight: 0,
		belowThresholdCycles: 0,
	},
	tags,
	content: `content of ${id}`,
})

const makeStore = (entities: MemoryEntity[]): EntityStore => {
	const dir = mkdtempSync(join(tmpdir(), "retrieve-test-"))
	const store = new EntityStore(dir)
	store.ensureDir()
	for (const e of entities) store.write(e)
	return store
}

describe("retrieve", () => {
	it("matching entities rank first", () => {
		const entities = [
			makeEntity("a", ["typescript", "auth"]),
			makeEntity("b", ["database", "sql"]),
			makeEntity("c", ["typescript", "config"]),
			makeEntity("d", ["logging"]),
			makeEntity("e", ["typescript", "auth", "config"]),
		]
		const store = makeStore(entities)
		const coAccess: CoAccessGraph = {}
		const results = retrieve({ taskDescription: "typescript auth config" }, store, coAccess, { now: nowFn }, 3)
		const ids = results.map((r) => r.entity.id)
		// e has 3 matching tags, a and c have 2 each; b and d have none
		expect(ids).toContain("e")
		expect(ids).not.toContain("b")
		expect(ids).not.toContain("d")
	})

	it("high tag overlap beats high salience with no overlap", () => {
		// High salience but NO tag overlap: reuseCount=1, decisionInfluence=0 → salience ≈ 2
		const highSalience = makeEntity("salience", [], 1, 0)
		// Two tag matches → tagOverlap score = 3*2 = 6, which exceeds salience entity's 2
		const tagMatch = makeEntity("tagmatch", ["typescript", "auth"])
		const store = makeStore([highSalience, tagMatch])
		const coAccess: CoAccessGraph = {}
		const results = retrieve({ taskDescription: "typescript auth" }, store, coAccess, { now: nowFn }, 1)
		expect(results[0].entity.id).toBe("tagmatch")
	})

	it("co-access boost: after two entities retrieved together, querying one surfaces the other", () => {
		const entities = [makeEntity("x", ["foo"]), makeEntity("y", ["bar"]), makeEntity("z", ["baz"])]
		const store = makeStore(entities)
		const coAccess: CoAccessGraph = {}

		// First retrieval: x and y are co-retrieved
		retrieve({ taskDescription: "foo bar" }, store, coAccess, { now: nowFn }, 2)

		// Now query only for 'foo' — y should get co-access boost because it was retrieved with x
		const secondResults = retrieve({ taskDescription: "foo" }, store, coAccess, { now: nowFn }, 3)
		const ids = secondResults.map((r) => r.entity.id)
		expect(ids).toContain("x")
		expect(ids).toContain("y")
	})
})
