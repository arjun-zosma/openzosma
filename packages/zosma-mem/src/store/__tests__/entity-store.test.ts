import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { MemoryEntity } from "../../types.js"
import { EntityStore } from "../entity-store.js"

const makeEntity = (id: string): MemoryEntity => ({
	id,
	content: `Content for ${id}`,
	tags: ["tag-a", "tag-b"],
	source: { branch: "main", commitRef: "42" },
	score: {
		reuseCount: 3,
		decisionInfluence: 1,
		ignoredReads: 0,
		lastAccessed: 1743897600000,
		attentionWeight: 0.8,
		belowThresholdCycles: 0,
	},
})

let dir: string
let store: EntityStore

describe("EntityStore", () => {
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "entity-store-test-"))
		store = new EntityStore(dir)
		store.ensureDir()
	})

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	it("write and read back an entity with all fields preserved", () => {
		const entity = makeEntity("auth-flow")
		store.write(entity)
		const result = store.read("auth-flow")
		expect(result).toBeDefined()
		expect(result?.id).toBe("auth-flow")
		expect(result?.content).toBe(entity.content)
		expect(result?.tags).toEqual(entity.tags)
		expect(result?.source).toEqual(entity.source)
		expect(result?.score).toEqual(entity.score)
	})

	it("list returns written entity id", () => {
		store.write(makeEntity("my-entity"))
		expect(store.list()).toContain("my-entity")
	})

	it("archive moves entity out of list", () => {
		store.write(makeEntity("to-archive"))
		expect(store.list()).toContain("to-archive")
		store.archive("to-archive")
		expect(store.list()).not.toContain("to-archive")
	})

	it("read of missing entity returns undefined", () => {
		expect(store.read("nonexistent")).toBeUndefined()
	})
})
