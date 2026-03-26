import fs from "node:fs"
import path from "node:path"
import { KNOWLEDGE_BASE_PATH } from "@/src/lib/constants"
import { resolveSafe, syncToGateway } from "@/src/lib/knowledge-base"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Recursively collect all file paths under a directory (relative to KB root).
 */
const collectFiles = (dir: string): { relPath: string; content: string }[] => {
	const results: { relPath: string; content: string }[] = []
	for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, dirent.name)
		if (dirent.isDirectory()) {
			results.push(...collectFiles(fullPath))
		} else if (dirent.isFile()) {
			const relPath = path.relative(path.resolve(KNOWLEDGE_BASE_PATH), fullPath)
			try {
				const content = fs.readFileSync(fullPath, "utf-8")
				results.push({ relPath, content })
			} catch {
				// Skip unreadable files
			}
		}
	}
	return results
}

const PATCH = async (request: NextRequest) => {
	const body = (await request.json()) as { oldPath: string; newPath: string }
	if (!body.oldPath || !body.newPath) {
		return NextResponse.json({ error: "Missing oldPath or newPath" }, { status: 400 })
	}

	const oldAbs = resolveSafe(body.oldPath)
	const newAbs = resolveSafe(body.newPath)

	if (!oldAbs || !newAbs) return NextResponse.json({ error: "Invalid path" }, { status: 400 })

	if (!fs.existsSync(oldAbs)) {
		return NextResponse.json({ error: "Source not found" }, { status: 404 })
	}

	if (fs.existsSync(newAbs)) {
		return NextResponse.json({ error: "Destination already exists" }, { status: 409 })
	}

	fs.mkdirSync(path.dirname(newAbs), { recursive: true })
	fs.renameSync(oldAbs, newAbs)

	// Sync to sandbox: delete old path, write new path(s).
	// For directories, we need to sync each file individually.
	const cookie = request.headers.get("cookie") ?? ""
	void syncToGateway(cookie, "delete", body.oldPath)

	const stat = fs.statSync(newAbs)
	if (stat.isDirectory()) {
		// Sync all files in the renamed directory
		for (const { relPath, content } of collectFiles(newAbs)) {
			void syncToGateway(cookie, "write", relPath, content)
		}
	} else {
		try {
			const content = fs.readFileSync(newAbs, "utf-8")
			void syncToGateway(cookie, "write", body.newPath, content)
		} catch {
			// File read failed after rename — unusual but non-fatal
		}
	}

	return NextResponse.json({ ok: true })
}

export { PATCH }
