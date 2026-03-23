import fs from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"

const KB_ROOT = process.env.KNOWLEDGE_BASE_PATH ?? path.join(process.cwd(), "../../.knowledge-base")

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
	fs.mkdirSync(KB_ROOT, { recursive: true })
	const tree = readTree(KB_ROOT)
	return NextResponse.json(tree)
}

export { GET }
