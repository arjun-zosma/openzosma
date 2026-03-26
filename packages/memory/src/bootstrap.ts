import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { createLogger } from "@openzosma/logger"
import { applyMemoryEnv } from "./config.js"
import type { MemoryBootstrapResult, MemoryConfig } from "./types.js"

const log = createLogger({ component: "memory" })

/**
 * Resolve the entry point file for an npm package.
 * Returns the absolute path to the file, or null if not found.
 */
function resolvePackageFile(pkgName: string, relPath: string): string | null {
	const require = createRequire(import.meta.url)
	try {
		const packageJsonPath = require.resolve(`${pkgName}/package.json`)
		return join(dirname(packageJsonPath), relPath)
	} catch {
		return null
	}
}

/**
 * Bootstrap the memory system for an agent pod session.
 *
 * 1. Sets environment variables (PI_MEMORY_DIR, etc.)
 * 2. Resolves extension entry points for pi-memory and pi-extension-observational-memory
 * 3. Returns paths to pass into DefaultResourceLoader.additionalExtensionPaths
 *
 * pi-memory is listed first so its session_before_compact hook (handoff capture)
 * runs before observational-memory's compaction override.
 */
export function bootstrapMemory(config: MemoryConfig): MemoryBootstrapResult {
	const memoryDir = applyMemoryEnv(config)

	const paths = [
		resolvePackageFile("pi-memory", "index.ts"),
		resolvePackageFile("pi-extension-observational-memory", "index.ts"),
	].filter((p): p is string => p !== null)

	if (paths.length === 0) {
		log.warn("Neither pi-memory nor pi-extension-observational-memory found. Memory system will not be available.")
	} else if (paths.length === 1) {
		const missing = paths[0].includes("pi-memory") ? "pi-extension-observational-memory" : "pi-memory"
		log.warn(`${missing} not found. Memory system will run in degraded mode.`)
	}

	return { paths, memoryDir }
}
