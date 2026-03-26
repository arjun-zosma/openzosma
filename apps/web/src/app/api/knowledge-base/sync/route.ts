import fs from "node:fs"
import path from "node:path"
import { auth } from "@/src/lib/auth"
import { GATEWAY_URL, KNOWLEDGE_BASE_PATH } from "@/src/lib/constants"
import { resolveSafe } from "@/src/lib/knowledge-base"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

interface KBFileEntry {
	path: string
	content: string
	sizeBytes: number
	modifiedAt: string
}

/**
 * GET /api/knowledge-base/sync
 *
 * Pull all KB files from the agent's sandbox and write them to the
 * local knowledge base directory. This is the "Sync from Agent" flow.
 *
 * Returns { synced: number, files: string[] } on success.
 */
const GET = async () => {
	const reqHeaders = await headers()
	const session = await auth.api.getSession({ headers: reqHeaders })
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	try {
		const response = await fetch(`${GATEWAY_URL}/api/v1/kb/pull`, {
			headers: {
				cookie: reqHeaders.get("cookie") ?? "",
			},
		})

		if (!response.ok) {
			const data = (await response.json()) as { error?: { message?: string } }
			const message = data.error?.message ?? `Gateway returned ${response.status}`
			return NextResponse.json({ error: message }, { status: response.status })
		}

		const data = (await response.json()) as { files: KBFileEntry[] }
		const files = data.files ?? []

		// Write each file to the local KB directory
		const syncedPaths: string[] = []
		for (const file of files) {
			const abs = resolveSafe(file.path)
			if (!abs) continue // Skip path traversal attempts

			fs.mkdirSync(path.dirname(abs), { recursive: true })
			fs.writeFileSync(abs, file.content, "utf-8")
			syncedPaths.push(file.path)
		}

		return NextResponse.json({ synced: syncedPaths.length, files: syncedPaths })
	} catch (err) {
		console.error("[knowledge-base/sync] Pull from gateway failed:", err)
		return NextResponse.json({ error: "Failed to reach gateway" }, { status: 502 })
	}
}

export { GET }
