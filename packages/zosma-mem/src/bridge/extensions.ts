/**
 * Pi extension path resolution for memory-related extensions.
 *
 * Resolves filesystem paths for pi-brain and pi-dcp so that the agent session
 * can pass them to DefaultResourceLoader. Both packages live here in
 * @openzosma/zosma-mem so agents stays decoupled from extension specifics.
 *
 * Graceful degradation: if a package is not installed, its path is omitted.
 * The caller (agents) receives only the paths that exist on disk.
 */

import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

/**
 * Try to resolve the entry point of a pi extension package.
 * Attempts the TypeScript source entry first (jiti loads .ts directly at runtime),
 * then falls back to the package root.
 */
const resolvePiExtension = (pkg: string): string | null => {
	for (const entry of [`${pkg}/src/index.ts`, `${pkg}/index.ts`, pkg]) {
		try {
			return require.resolve(entry)
		} catch {
			// try next candidate
		}
	}
	return null
}

/**
 * Resolve extension entry paths for all memory-related pi extensions:
 * - pi-brain: structured memory entities, versioning, branch/commit tools
 * - pi-dcp: dynamic context pruning, token management
 *
 * Returns only the paths that successfully resolved. Missing packages are
 * silently skipped — the caller should log a warning if the list is shorter
 * than expected.
 */
export const resolveMemoryExtensionPaths = (): { paths: string[]; missing: string[] } => {
	const extensions = [
		{ name: "pi-brain", label: "structured memory (pi-brain)" },
		{ name: "pi-dcp", label: "context pruning (pi-dcp)" },
	]

	const paths: string[] = []
	const missing: string[] = []

	for (const ext of extensions) {
		const resolved = resolvePiExtension(ext.name)
		if (resolved) {
			paths.push(resolved)
		} else {
			missing.push(ext.label)
		}
	}

	return { paths, missing }
}
