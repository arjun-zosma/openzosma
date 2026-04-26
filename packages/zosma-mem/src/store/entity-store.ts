import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import type { MemoryEntity } from "../types.js"

export class EntityStore {
	private readonly salienceDir: string
	private readonly archiveDir: string

	constructor(memoryDir: string) {
		this.salienceDir = join(memoryDir, ".salience")
		this.archiveDir = join(memoryDir, ".salience", "archive")
	}

	ensureDir = (): void => {
		mkdirSync(this.salienceDir, { recursive: true })
		mkdirSync(this.archiveDir, { recursive: true })
	}

	read = (entityId: string): MemoryEntity | undefined => {
		const p = this.idToPath(entityId)
		if (!existsSync(p)) return undefined
		return parseYaml(readFileSync(p, "utf-8")) as MemoryEntity
	}

	write = (entity: MemoryEntity): void => {
		writeFileSync(this.idToPath(entity.id), stringifyYaml(entity), "utf-8")
	}

	list = (): string[] => {
		if (!existsSync(this.salienceDir)) return []
		return readdirSync(this.salienceDir)
			.filter((f) => f.endsWith(".yaml"))
			.map((f) => f.slice(0, -5))
	}

	archive = (entityId: string): void => {
		const src = this.idToPath(entityId)
		const dst = join(this.archiveDir, `${entityId}.yaml`)
		if (existsSync(src)) renameSync(src, dst)
	}

	private idToPath = (entityId: string): string => join(this.salienceDir, `${entityId}.yaml`)
}
