import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import type { ReadStream } from "node:fs"
import { copyFile } from "node:fs/promises"
import { basename, extname, join, resolve } from "node:path"
import type { DetectedFile } from "./file-scanner.js"

export interface ArtifactEntry {
	/** The filename in the artifacts directory. */
	filename: string
	/** MIME type. */
	mediatype: string
	/** Size in bytes. */
	sizebytes: number
	/** When the artifact was created (ISO string). */
	createdAt: string
}

/**
 * Manages the isolated artifacts directory for session output files.
 *
 * Artifacts live in `<workspaceRoot>/artifacts/<sessionId>/`, separate from
 * the agent's working directory so the agent cannot interfere with them.
 */
export class ArtifactManager {
	private artifactsRoot: string

	constructor(workspaceRoot?: string) {
		const root = workspaceRoot ?? resolve(process.env.OPENZOSMA_WORKSPACE ?? join(process.cwd(), "workspace"))
		this.artifactsRoot = join(root, "artifacts")
	}

	private sessionDir(sessionId: string): string {
		return join(this.artifactsRoot, sessionId)
	}

	/**
	 * Copies detected output files from the agent workspace into the
	 * isolated artifacts directory for a session.
	 *
	 * Handles filename collisions by appending a numeric suffix.
	 * Returns the list of artifacts that were actually promoted.
	 */
	async promoteFiles(sessionId: string, detectedFiles: DetectedFile[]): Promise<ArtifactEntry[]> {
		if (detectedFiles.length === 0) return []

		const dir = this.sessionDir(sessionId)
		mkdirSync(dir, { recursive: true })

		const promoted: ArtifactEntry[] = []

		for (const file of detectedFiles) {
			const targetFilename = this.resolveFilename(dir, file.filename)
			const targetPath = join(dir, targetFilename)

			try {
				await copyFile(file.absolutePath, targetPath)
				const stat = statSync(targetPath)
				promoted.push({
					filename: targetFilename,
					mediatype: file.mediatype,
					sizebytes: stat.size,
					createdAt: new Date().toISOString(),
				})
			} catch (err) {
				console.error(`[artifact-manager] Failed to promote ${file.relativePath}:`, err)
			}
		}

		return promoted
	}

	/**
	 * Lists all artifacts for a session.
	 */
	listArtifacts(sessionId: string): ArtifactEntry[] {
		const dir = this.sessionDir(sessionId)
		if (!existsSync(dir)) return []

		const entries: ArtifactEntry[] = []
		let files: string[]
		try {
			files = readdirSync(dir)
		} catch {
			return entries
		}

		for (const filename of files) {
			const filepath = join(dir, filename)
			try {
				const stat = statSync(filepath)
				if (!stat.isFile()) continue
				entries.push({
					filename,
					mediatype: mimeFromExtension(filename),
					sizebytes: stat.size,
					createdAt: stat.birthtime.toISOString(),
				})
			} catch {
				// skip unreadable files
			}
		}

		return entries
	}

	/**
	 * Returns a readable stream and metadata for serving a specific artifact.
	 * Returns null if the artifact does not exist.
	 */
	getArtifactStream(
		sessionId: string,
		filename: string,
	): { stream: ReadStream; mediatype: string; sizebytes: number } | null {
		// Prevent path traversal
		const sanitized = basename(filename)
		const filepath = join(this.sessionDir(sessionId), sanitized)

		if (!existsSync(filepath)) return null

		try {
			const stat = statSync(filepath)
			if (!stat.isFile()) return null

			return {
				stream: createReadStream(filepath),
				mediatype: mimeFromExtension(sanitized),
				sizebytes: stat.size,
			}
		} catch {
			return null
		}
	}

	/**
	 * Deletes all artifacts for a session.
	 */
	deleteArtifacts(sessionId: string): void {
		const dir = this.sessionDir(sessionId)
		if (!existsSync(dir)) return

		try {
			rmSync(dir, { recursive: true, force: true })
		} catch (err) {
			console.error(`[artifact-manager] Failed to delete artifacts for session ${sessionId}:`, err)
		}
	}

	/**
	 * Resolves a unique filename within a directory, appending a numeric
	 * suffix if the name already exists. e.g. `report.html` -> `report-1.html`
	 */
	private resolveFilename(dir: string, desiredName: string): string {
		if (!existsSync(join(dir, desiredName))) return desiredName

		const ext = extname(desiredName)
		const base = desiredName.slice(0, desiredName.length - ext.length)
		let counter = 1
		let candidate = `${base}-${counter}${ext}`
		while (existsSync(join(dir, candidate))) {
			counter++
			candidate = `${base}-${counter}${ext}`
		}
		return candidate
	}
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
