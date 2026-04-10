/**
 * CommitIndexer — bridges pi-brain commits.md files into the salience entity store.
 *
 * Responsibilities:
 * - Walk all (or a single) pi-brain branch commits.md files
 * - Parse each commit block into a MemoryEntity via the brain adapter
 * - Ingest the entity through the salience engine
 * - Track processed commit hashes so re-running is idempotent
 * - Optionally watch commits.md files with chokidar for live updates
 *
 * Entity IDs are namespaced: "<branch>-<commitHash>" to avoid collisions.
 * Co-mingled branch entities are handled naturally — the namespace keeps them distinct.
 *
 * Indexed refs are persisted in .salience/indexed.json:
 *   { "main": ["abc12345", "def67890"], "feature-x": ["xyz99999"] }
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { FSWatcher } from "chokidar"
import chokidar from "chokidar"
import pLimit from "p-limit"
import { listBranches, parseCommits, readCommitsRaw } from "../brain-adapter.js"
import type { EntityStore } from "../store/entity-store.js"
import type { MemoryConfig } from "../types.js"
import { ingest } from "./ingest.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IndexerConfig {
	memoryDir: string
	store: EntityStore
	salienceConfig: Pick<MemoryConfig, "salienceThreshold" | "now">
	/** Max parallel branch indexing operations. Default: 4 */
	concurrency?: number
}

type IndexedRefs = Record<string, string[]>

// ---------------------------------------------------------------------------
// CommitIndexer
// ---------------------------------------------------------------------------

export class CommitIndexer {
	private readonly memoryDir: string
	private readonly indexedPath: string
	private readonly store: EntityStore
	private readonly salienceConfig: Pick<MemoryConfig, "salienceThreshold" | "now">
	private readonly limit: ReturnType<typeof pLimit>
	private watcher: FSWatcher | null = null

	constructor(config: IndexerConfig) {
		this.memoryDir = config.memoryDir
		this.indexedPath = join(config.memoryDir, ".salience", "indexed.json")
		this.store = config.store
		this.salienceConfig = config.salienceConfig
		this.limit = pLimit(config.concurrency ?? 4)
	}

	// -------------------------------------------------------------------------
	// Indexed refs persistence
	// -------------------------------------------------------------------------

	private loadIndexedRefs = (): IndexedRefs => {
		if (!existsSync(this.indexedPath)) return {}
		try {
			return JSON.parse(readFileSync(this.indexedPath, "utf-8")) as IndexedRefs
		} catch {
			return {}
		}
	}

	private saveIndexedRefs = (refs: IndexedRefs): void => {
		writeFileSync(this.indexedPath, JSON.stringify(refs, null, 2), "utf-8")
	}

	// -------------------------------------------------------------------------
	// Single-branch indexing
	// -------------------------------------------------------------------------

	/**
	 * Index new commits on a single branch. Already-processed commit hashes are
	 * skipped — safe to call repeatedly without duplicating entities.
	 *
	 * Returns the number of new entities ingested.
	 */
	indexBranch = (branch: string): number => {
		const raw = readCommitsRaw(this.memoryDir, branch)
		if (!raw.trim()) return 0

		const refs = this.loadIndexedRefs()
		const processed = new Set(refs[branch] ?? [])
		const commits = parseCommits(raw, branch)

		let count = 0
		for (const commit of commits) {
			if (processed.has(commit.hash)) continue

			const entityId = `${branch}-${commit.hash}`
			ingest(
				{
					id: entityId,
					type: "decision",
					content: commit.content || `Commit ${commit.hash} on ${branch}`,
					tags: extractTagsFromContent(commit.content, branch),
					metadata: {
						branch: commit.branch,
						commitRef: commit.hash,
					},
					timestamp: parseTimestamp(commit.timestamp),
				},
				this.store,
				this.salienceConfig,
			)

			processed.add(commit.hash)
			count++
		}

		if (count > 0) {
			refs[branch] = [...processed]
			this.saveIndexedRefs(refs)
		}

		return count
	}

	// -------------------------------------------------------------------------
	// All-branch reindex
	// -------------------------------------------------------------------------

	/**
	 * Re-index all pi-brain branches. Idempotent — already-processed commits
	 * are skipped. Returns the total count of newly ingested entities.
	 */
	reindexAll = async (): Promise<number> => {
		const branches = listBranches(this.memoryDir)
		if (branches.length === 0) return 0

		const counts = await Promise.all(branches.map((branch) => this.limit(() => this.indexBranch(branch))))
		return counts.reduce((sum, n) => sum + n, 0)
	}

	// -------------------------------------------------------------------------
	// Chokidar watch
	// -------------------------------------------------------------------------

	/**
	 * Start watching all commits.md files for changes. When pi-brain writes a new
	 * commit the indexer automatically processes it.
	 *
	 * The provided callback receives the branch name and count of new entities each
	 * time new commits are indexed.
	 */
	watch = (onChange?: (branch: string, newCount: number) => void): void => {
		if (this.watcher) return

		const pattern = join(this.memoryDir, "branches", "**", "commits.md")
		this.watcher = chokidar.watch(pattern, { ignoreInitial: true, persistent: false })

		this.watcher.on("change", (filePath: string) => {
			// Extract branch name from path: .memory/branches/<branch>/commits.md
			const parts = (filePath as string).split(/[/\\]/)
			const branchesIdx = parts.lastIndexOf("branches")
			if (branchesIdx === -1 || branchesIdx + 1 >= parts.length) return
			const branch = parts[branchesIdx + 1]
			const count = this.indexBranch(branch)
			if (count > 0 && onChange) onChange(branch, count)
		})
	}

	/**
	 * Stop watching. Safe to call when no watcher is active.
	 */
	stopWatch = (): void => {
		if (this.watcher) {
			void this.watcher.close()
			this.watcher = null
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract keyword tags from commit content + branch name.
 * Keeps words > 3 chars, lowercased, deduped, max 20 tags.
 */
const STOP = new Set([
	"the",
	"and",
	"for",
	"are",
	"was",
	"has",
	"have",
	"been",
	"will",
	"this",
	"that",
	"with",
	"from",
	"they",
	"not",
	"but",
	"its",
	"into",
	"more",
	"also",
	"some",
	"than",
	"then",
	"when",
	"where",
	"what",
	"which",
	"how",
	"would",
])

const extractTagsFromContent = (content: string, branch: string): string[] => {
	const branchParts = branch
		.replace(/[-_]/g, " ")
		.split(" ")
		.filter((t) => t.length > 2)

	const tokens = content
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((t) => t.length > 3 && !STOP.has(t))

	const all = [...new Set([...branchParts, ...tokens])]
	all.sort((a, b) => b.length - a.length)
	return all.slice(0, 20)
}

const parseTimestamp = (ts: string): number => {
	const d = new Date(ts)
	return Number.isNaN(d.getTime()) ? Date.now() : d.getTime()
}
