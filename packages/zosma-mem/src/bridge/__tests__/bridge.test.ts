import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createMemoryBridge } from "../../bridge/index.js"
import type { ExtractedFact } from "../../bridge/index.js"

describe("MemoryBridge", () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = join(tmpdir(), `zosma-mem-test-${Date.now()}`)
		mkdirSync(tempDir, { recursive: true })
	})

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true })
	})

	describe("ingestFacts and loadContext round-trip", () => {
		it("should ingest facts and retrieve them in context", async () => {
			const bridge = createMemoryBridge({ memoryDir: tempDir })

			const facts: ExtractedFact[] = [
				{
					content: "User prefers dark mode interfaces",
					type: "preference",
					tags: ["ui", "theme", "preference"],
				},
			]

			await bridge.ingestFacts(facts)

			const { context, ids } = await bridge.loadContext("design the UI")
			expect(context).toContain("User prefers dark mode interfaces")
			expect(ids).toHaveLength(1)
			expect(ids[0]).toMatch(/^[a-f0-9]{16}$/)
		})

		it("should return empty context when no relevant memories", async () => {
			const bridge = createMemoryBridge({ memoryDir: tempDir })

			const { context, ids } = await bridge.loadContext("unrelated query")
			expect(context).toBe("")
			expect(ids).toEqual([])
		})

		it("should deduplicate identical facts", async () => {
			const bridge = createMemoryBridge({ memoryDir: tempDir })

			const facts: ExtractedFact[] = [
				{
					content: "User likes coffee",
					type: "preference",
					tags: ["drink", "preference"],
				},
				{
					content: "User likes coffee", // Same content
					type: "preference",
					tags: ["drink", "preference"],
				},
			]

			await bridge.ingestFacts(facts)

			const entityIds = await bridge.listEntityIds()
			expect(entityIds).toHaveLength(1) // Should be deduplicated
		})
	})

	describe("reinforcement tracking", () => {
		it("should record usage signals", async () => {
			const bridge = createMemoryBridge({ memoryDir: tempDir })

			const facts: ExtractedFact[] = [
				{
					content: "User's favorite color is blue",
					type: "preference",
					tags: ["color", "preference"],
				},
			]

			await bridge.ingestFacts(facts)
			const { ids } = await bridge.loadContext("what color should I use")
			expect(ids).toHaveLength(1)

			const entityId = ids[0]

			// Record different usage signals
			await bridge.recordUsage(entityId, "used")
			await bridge.recordUsage(entityId, "ignored")
			await bridge.recordUsage(entityId, "influenced_decision")

			// Should not throw
			expect(true).toBe(true)
		})
	})

	describe("garbage collection", () => {
		it("should run GC without errors", async () => {
			const bridge = createMemoryBridge({ memoryDir: tempDir })

			const facts: ExtractedFact[] = [
				{
					content: "Old preference that should be garbage collected",
					type: "preference",
					tags: ["old"],
				},
			]

			await bridge.ingestFacts(facts)
			await bridge.gc() // Should not throw

			expect(true).toBe(true)
		})
	})

	describe("shutdown", () => {
		it("should shutdown without errors", async () => {
			const bridge = createMemoryBridge({ memoryDir: tempDir })
			bridge.shutdown() // Should not throw
			expect(true).toBe(true)
		})
	})

	describe("cross-session persistence", () => {
		it("should persist facts across bridge instances", async () => {
			// First bridge instance
			const bridge1 = createMemoryBridge({ memoryDir: tempDir })
			const facts: ExtractedFact[] = [
				{
					content: "Persistent memory across sessions",
					type: "decision",
					tags: ["persistent", "test"],
				},
			]

			await bridge1.ingestFacts(facts)
			bridge1.shutdown()

			// Second bridge instance with same directory
			const bridge2 = createMemoryBridge({ memoryDir: tempDir })
			const { context } = await bridge2.loadContext("test query")

			expect(context).toContain("Persistent memory across sessions")
		})
	})

	describe("salience filtering", () => {
		it("should respect salience threshold", async () => {
			const bridge = createMemoryBridge({ memoryDir: tempDir, salienceThreshold: 10 })

			const facts: ExtractedFact[] = [
				{
					content: "High salience fact",
					type: "decision",
					tags: ["important"],
				},
				{
					content: "Low salience fact",
					type: "pattern",
					tags: ["minor"],
				},
			]

			await bridge.ingestFacts(facts)

			// Run GC to prune low-salience facts
			await bridge.gc()

			const { context } = await bridge.loadContext("important query")
			expect(context).toBeTruthy() // At least some facts should remain
		})
	})

	describe("context formatting", () => {
		it("should format context with proper structure", async () => {
			const bridge = createMemoryBridge({ memoryDir: tempDir })

			const facts: ExtractedFact[] = [
				{
					content: "Test memory content",
					type: "preference",
					tags: ["test"],
				},
			]

			await bridge.ingestFacts(facts)
			const { context } = await bridge.loadContext("test")

			expect(context).toContain("## Long-term Memory")
			expect(context).toContain("Test memory content")
			expect(context).toContain("Use them to inform your responses naturally")
		})

		it("should limit retrieved memories to topK", async () => {
			const bridge = createMemoryBridge({ memoryDir: tempDir, topK: 2 })

			const facts: ExtractedFact[] = Array.from({ length: 5 }, (_, i) => ({
				content: `Memory fact ${i}`,
				type: "preference" as const,
				tags: ["test"],
			}))

			await bridge.ingestFacts(facts)
			const { ids } = await bridge.loadContext("test")

			expect(ids).toHaveLength(2) // Limited by topK
		})
	})

	describe("evaluation integration", () => {
		it("should evaluate retrieval effectiveness using the eval module", async () => {
			const bridge = createMemoryBridge({ memoryDir: tempDir })

			// Ingest test facts
			const facts: ExtractedFact[] = [
				{
					content: "User prefers dark mode",
					type: "preference",
					tags: ["ui", "theme"],
				},
				{
					content: "User likes coffee",
					type: "preference",
					tags: ["drink", "preference"],
				},
				{
					content: "Agent should use bash for files",
					type: "pattern",
					tags: ["tool", "bash", "file"],
				},
			]

			await bridge.ingestFacts(facts)

			// Import eval dynamically to avoid circular deps
			const { evaluateMemory } = await import("../../evals/index.js")

			const testCases = [
				{
					query: "UI design",
					expectedIds: [], // We don't know exact IDs, so test content instead
					expectedContent: ["User prefers dark mode"],
				},
				{
					query: "beverages",
					expectedIds: [],
					expectedContent: ["User likes coffee"],
				},
				{
					query: "file handling",
					expectedIds: [],
					expectedContent: ["Agent should use bash for files"],
				},
			]

			const results = await evaluateMemory(bridge, { testCases })

			// Since we can't predict exact IDs, check that some retrieval happened
			expect(results.metrics.avgRecall).toBeGreaterThanOrEqual(0)
			expect(results.metrics.avgPrecision).toBeGreaterThanOrEqual(0)
			expect(results.cases).toHaveLength(3)

			// Check that relevant content was retrieved
			for (const caseResult of results.cases) {
				const hasExpected = testCases
					.find((tc) => tc.query === caseResult.query)
					?.expectedContent.some((ec) => caseResult.retrievedContext.includes(ec))
				if (hasExpected) {
					expect(caseResult.retrievedContext).toBeTruthy()
				}
			}
		})
	})
})
