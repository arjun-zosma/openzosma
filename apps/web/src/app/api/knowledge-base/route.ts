import fs from "node:fs"
import path from "node:path"
import { KNOWLEDGE_BASE_PATH } from "@/src/lib/constants"
import { NextResponse } from "next/server"

interface KBEntry {
	id: string
	name: string
	type: "file" | "folder"
	children?: KBEntry[]
}

const readTree = (dir: string, relativePath = ""): KBEntry[] => {
	let entries: fs.Dirent[]
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true })
	} catch {
		return []
	}

	const result: KBEntry[] = []

	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue

		const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

		if (entry.isDirectory()) {
			result.push({
				id: entryRelPath,
				name: entry.name,
				type: "folder",
				children: readTree(path.join(dir, entry.name), entryRelPath),
			})
		} else if (entry.isFile()) {
			result.push({
				id: entryRelPath,
				name: entry.name,
				type: "file",
			})
		}
	}

	return result
}

const GET = async () => {
	fs.mkdirSync(KNOWLEDGE_BASE_PATH, { recursive: true })
	const tree = readTree(KNOWLEDGE_BASE_PATH)
	return NextResponse.json(tree)
}

export { GET }
