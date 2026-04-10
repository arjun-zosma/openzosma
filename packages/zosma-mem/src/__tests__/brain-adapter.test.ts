import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import { listBranches, parseCommits, readCommitsRaw, readState } from "../brain-adapter.js"

const mkTempDir = (): string => mkdtempSync(join(tmpdir(), "brain-adapter-test-"))

describe("brain-adapter", () => {
	let dir: string

	beforeEach(() => {
		dir = mkTempDir()
	})

	it("readState returns safe default when file missing", () => {
		const state = readState(join(dir, ".memory"))
		expect(state.activeBranch).toBe("main")
		expect(state.initialized).toBe(false)
		expect(state.lastCommit).toBeNull()
	})

	it("readState parses a valid state.yaml", () => {
		const memDir = join(dir, ".memory")
		mkdirSync(memDir, { recursive: true })
		writeFileSync(
			join(memDir, "state.yaml"),
			[
				"active_branch: feature-x",
				"initialized: '2026-01-01T00:00:00Z'",
				"last_commit:",
				"  branch: feature-x",
				"  hash: abc12345",
				"  timestamp: '2026-04-01T12:00:00Z'",
				"  summary: First commit",
			].join("\n"),
		)
		const state = readState(memDir)
		expect(state.activeBranch).toBe("feature-x")
		expect(state.initialized).toBe(true)
		expect(state.lastCommit?.hash).toBe("abc12345")
		expect(state.lastCommit?.summary).toBe("First commit")
	})

	it("listBranches returns empty array when branches dir missing", () => {
		expect(listBranches(join(dir, ".memory"))).toEqual([])
	})

	it("listBranches returns branch names", () => {
		const memDir = join(dir, ".memory")
		mkdirSync(join(memDir, "branches", "main"), { recursive: true })
		mkdirSync(join(memDir, "branches", "feature-auth"), { recursive: true })
		const branches = listBranches(memDir)
		expect(branches).toContain("main")
		expect(branches).toContain("feature-auth")
	})

	it("parseCommits extracts commit blocks", () => {
		const raw = [
			"# main",
			"",
			"**Purpose:** Test",
			"",
			"---",
			"",
			"## Commit abc12345 | 2026-04-01T12:00:00.000Z",
			"",
			"Use JWT tokens for auth",
			"",
			"---",
			"",
			"## Commit def67890 | 2026-04-02T12:00:00.000Z",
			"",
			"Add retry logic for API calls",
			"",
		].join("\n")

		const commits = parseCommits(raw, "main")
		expect(commits).toHaveLength(2)
		expect(commits[0].hash).toBe("abc12345")
		expect(commits[0].branch).toBe("main")
		expect(commits[0].content).toContain("JWT")
		expect(commits[1].hash).toBe("def67890")
		expect(commits[1].content).toContain("retry")
	})

	it("parseCommits returns empty array for empty input", () => {
		expect(parseCommits("", "main")).toEqual([])
	})

	it("readCommitsRaw returns empty string when file missing", () => {
		expect(readCommitsRaw(join(dir, ".memory"), "main")).toBe("")
	})
})
