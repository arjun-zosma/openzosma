import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type CoAccessGraph = Record<string, string[]>

export const loadCoAccess = (memoryDir: string): CoAccessGraph => {
	const p = join(memoryDir, "co-access.json")
	if (!existsSync(p)) return {}
	return JSON.parse(readFileSync(p, "utf-8")) as CoAccessGraph
}

export const saveCoAccess = (memoryDir: string, graph: CoAccessGraph): void => {
	writeFileSync(join(memoryDir, "co-access.json"), JSON.stringify(graph, null, 2), "utf-8")
}

export const recordCoAccess = (graph: CoAccessGraph, entityIds: string[]): CoAccessGraph => {
	const updated = { ...graph }
	for (const a of entityIds) {
		for (const b of entityIds) {
			if (a === b) continue
			if (!updated[a]) updated[a] = []
			if (!updated[a].includes(b)) updated[a].push(b)
		}
	}
	return updated
}
