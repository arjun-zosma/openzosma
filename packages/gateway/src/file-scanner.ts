import { type Stats, readdirSync, statSync } from "node:fs"
import { extname, join, relative } from "node:path"

/**
 * Extensions considered user-facing output (case-insensitive).
 * Files with these extensions are promoted to artifacts.
 */
const OUTPUT_EXTENSIONS = new Set([
	".html",
	".pdf",
	".csv",
	".xlsx",
	".xls",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".svg",
	".txt",
	".md",
	".json",
	".xml",
])

/**
 * Directories to exclude when scanning the workspace.
 */
const EXCLUDED_DIRS = new Set([".knowledge-base", ".git", "node_modules", "__pycache__", ".venv"])

/**
 * Subdirectory that the agent can use to explicitly mark files as output,
 * regardless of extension.
 */
const OUTPUT_DIR = "output"

export interface FileSnapshot {
	/** Relative path from workspace root. */
	relativePath: string
	/** Last modification time in ms. */
	mtimeMs: number
	/** File size in bytes. */
	sizebytes: number
}

export interface DetectedFile {
	/** The filename (basename). */
	filename: string
	/** Relative path from workspace root. */
	relativePath: string
	/** Absolute path on disk. */
	absolutePath: string
	/** Size in bytes. */
	sizebytes: number
	/** MIME type derived from extension. */
	mediatype: string
}

/** Maps file extensions to MIME types. */
const MIME_MAP: Record<string, string> = {
	".html": "text/html",
	".pdf": "application/pdf",
	".csv": "text/csv",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".xls": "application/vnd.ms-excel",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".txt": "text/plain",
	".md": "text/markdown",
	".json": "application/json",
	".xml": "application/xml",
}

function mimeFromExtension(filepath: string): string {
	const ext = extname(filepath).toLowerCase()
	return MIME_MAP[ext] ?? "application/octet-stream"
}

/**
 * Recursively walks a directory and returns file entries.
 * Skips excluded directories.
 */
function walkDir(dir: string, baseDir: string): { relativePath: string; absolutePath: string; stat: Stats }[] {
	const results: { relativePath: string; absolutePath: string; stat: Stats }[] = []

	let entries: string[]
	try {
		entries = readdirSync(dir)
	} catch {
		return results
	}

	for (const entry of entries) {
		const absolutePath = join(dir, entry)
		let stat: Stats
		try {
			stat = statSync(absolutePath) as Stats
		} catch {
			continue
		}

		if (stat.isDirectory()) {
			if (EXCLUDED_DIRS.has(entry)) continue
			results.push(...walkDir(absolutePath, baseDir))
		} else if (stat.isFile()) {
			results.push({
				relativePath: relative(baseDir, absolutePath),
				absolutePath,
				stat,
			})
		}
	}

	return results
}

/**
 * Returns true if a file qualifies as a user-facing artifact.
 *
 * A file qualifies if:
 * 1. It lives inside the `output/` subdirectory (any extension), OR
 * 2. Its extension is in the OUTPUT_EXTENSIONS whitelist.
 */
function isOutputFile(relativePath: string): boolean {
	// Check if file is inside the output/ directory
	if (relativePath.startsWith(`${OUTPUT_DIR}/`) || relativePath.startsWith(`${OUTPUT_DIR}\\`)) {
		return true
	}

	const ext = extname(relativePath).toLowerCase()
	return OUTPUT_EXTENSIONS.has(ext)
}

/**
 * Creates a snapshot of all qualifying output files in a workspace directory.
 */
export function createSnapshot(workspaceDir: string): Map<string, FileSnapshot> {
	const snapshot = new Map<string, FileSnapshot>()

	for (const { relativePath, stat } of walkDir(workspaceDir, workspaceDir)) {
		if (!isOutputFile(relativePath)) continue
		snapshot.set(relativePath, {
			relativePath,
			mtimeMs: stat.mtimeMs,
			sizebytes: stat.size,
		})
	}

	return snapshot
}

/**
 * Compares the current state of a workspace against a previous snapshot.
 * Returns newly created or modified files that qualify as output.
 */
export function detectChanges(
	workspaceDir: string,
	previousSnapshot: Map<string, FileSnapshot>,
): { newSnapshot: Map<string, FileSnapshot>; changedFiles: DetectedFile[] } {
	const newSnapshot = createSnapshot(workspaceDir)
	const changedFiles: DetectedFile[] = []

	for (const [relPath, current] of newSnapshot) {
		const prev = previousSnapshot.get(relPath)
		// New file or modified file (mtime or size changed)
		if (!prev || prev.mtimeMs !== current.mtimeMs || prev.sizebytes !== current.sizebytes) {
			const absolutePath = join(workspaceDir, relPath)
			const filename = relPath.split("/").pop() ?? relPath
			changedFiles.push({
				filename,
				relativePath: relPath,
				absolutePath,
				sizebytes: current.sizebytes,
				mediatype: mimeFromExtension(relPath),
			})
		}
	}

	return { newSnapshot, changedFiles }
}
