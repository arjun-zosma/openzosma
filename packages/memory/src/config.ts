import { join } from "node:path"
import type { MemoryConfig } from "./types.js"

const DEFAULT_MEMORY_SUBDIR = ".pi/agent/memory"

/**
 * Apply memory-related environment variables before extensions are loaded.
 * Must be called before the pi session is created.
 */
export function applyMemoryEnv(config: MemoryConfig): string {
	const memoryDir = config.memoryDir ?? join(config.workspaceDir, DEFAULT_MEMORY_SUBDIR)

	process.env.PI_MEMORY_DIR = memoryDir

	if (config.qmdUpdateMode) {
		process.env.PI_MEMORY_QMD_UPDATE = config.qmdUpdateMode
	}

	if (config.disableSearch) {
		process.env.PI_MEMORY_NO_SEARCH = "1"
	}

	return memoryDir
}
