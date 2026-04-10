import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import { CommitIndexer } from "../../ingestion/commit-indexer.js"
import { EntityStore } from "../../store/entity-store.js"

const mkTempDir = (): string => mkdtempSync(join(tmpdir(), "commit-indexer-test-"))

const makeMemoryDir = (dir: string): string => {
	const memDir = join(dir, ".memory")
	mkdirSync(join(memDir, ".salience"), { recursive: true })
	return memDir
}

const makeCommitsFile = (memDir: string, branch: string, content: string): void => {
	mkdirSync(join(memDir, "branches", branch), { recursive: true })
	writeFileSync(join(memDir, "branches", branch, "commits.md"), content)
}

describe("CommitIndexer", () => {
	let dir: string
	let memDir: string
	let store: EntityStore
	let indexer: CommitIndexer

	beforeEach(() => {
		dir = mkTempDir()
		memDir = makeMemoryDir(dir)
		store = new EntityStore(memDir)
		store.ensureDir()
		indexer = new CommitIndexer({ memoryDir: memDir, store, salienceConfig: {} })
	})

	it("indexBranch returns 0 when commits.md missing", () => {
		expect(indexer.indexBranch("main")).toBe(0)
	})

	it("indexBranch ingests commits as entities", () => {
		const raw = [
			"## Commit abc12345 | 2026-04-01T12:00:00.000Z",
			"",
			"Use JWT tokens for authentication with refresh support",
			"",
			"---",
			"",
			"## Commit def67890 | 2026-04-02T12:00:00.000Z",
			"",
			"Add retry logic for API calls with exponential backoff",
			"",
		].join("\n")
		makeCommitsFile(memDir, "main", raw)

		const count = indexer.indexBranch("main")
		expect(count).toBe(2)

		const ids = store.list()
		expect(ids).toContain("main-abc12345")
		expect(ids).toContain("main-def67890")
	})

	it("indexBranch is idempotent — re-indexing skips already-processed commits", () => {
		const raw = "## Commit abc12345 | 2026-04-01T12:00:00.000Z\n\nSome content\n"
		makeCommitsFile(memDir, "main", raw)

		const first = indexer.indexBranch("main")
		const second = indexer.indexBranch("main")

		expect(first).toBe(1)
		expect(second).toBe(0)
	})

	it("reindexAll processes multiple branches", async () => {
		const commit1 = "## Commit aaaa0001 | 2026-04-01T12:00:00.000Z\n\nMain branch content\n"
		const commit2 = "## Commit bbbb0002 | 2026-04-01T12:00:00.000Z\n\nFeature branch content\n"
		makeCommitsFile(memDir, "main", commit1)
		makeCommitsFile(memDir, "feature-auth", commit2)

		const total = await indexer.reindexAll()
		expect(total).toBe(2)

		const ids = store.list()
		expect(ids).toContain("main-aaaa0001")
		expect(ids).toContain("feature-auth-bbbb0002")
	})

	it("entity from indexed commit has correct branch source metadata", () => {
		const raw = "## Commit abc12345 | 2026-04-01T12:00:00.000Z\n\nAuth content\n"
		makeCommitsFile(memDir, "main", raw)
		indexer.indexBranch("main")

		const entity = store.read("main-abc12345")
		expect(entity?.source.branch).toBe("main")
		expect(entity?.source.commitRef).toBe("abc12345")
	})
})
