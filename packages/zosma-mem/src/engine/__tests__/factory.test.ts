import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createMemoryEngine } from "../factory.js"

const NOW = 1_000_000_000_000

const makeDir = () => mkdtempSync(join(tmpdir(), "factory-test-"))

describe("createMemoryEngine", () => {
	it("ingest a decision event then retrieve it", async () => {
		const memoryDir = makeDir()
		const engine = createMemoryEngine({ memoryDir, gcIntervalMs: 0, now: () => NOW })
		await engine.ingest({
			id: "ev1",
			type: "decision",
			content: "use typescript for everything",
			tags: ["typescript", "architecture"],
			timestamp: NOW,
		})
		const results = await engine.retrieve({ taskDescription: "typescript architecture" }, 5)
		expect(results.some((r) => r.entity.id === "ev1")).toBe(true)
		engine.shutdown()
	})

	it("shutdown does not throw", () => {
		const memoryDir = makeDir()
		const engine = createMemoryEngine({ memoryDir, gcIntervalMs: 0 })
		expect(() => engine.shutdown()).not.toThrow()
	})

	it("ingest + recordDecisionInfluence + retrieve: entity still appears", async () => {
		const memoryDir = makeDir()
		const engine = createMemoryEngine({ memoryDir, gcIntervalMs: 0, now: () => NOW })
		await engine.ingest({
			id: "ev2",
			type: "decision",
			content: "auth strategy",
			tags: ["auth"],
			timestamp: NOW,
		})
		await engine.recordDecisionInfluence("ev2")
		const results = await engine.retrieve({ taskDescription: "auth strategy" }, 5)
		expect(results.some((r) => r.entity.id === "ev2")).toBe(true)
		engine.shutdown()
	})
})
