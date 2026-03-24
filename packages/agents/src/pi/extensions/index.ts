import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { syncGuardrailsConfig } from "./guard-rails.js"
import { applySubagentEnv, isPiAvailable, syncSubagentDefinitions, syncSubagentsConfig } from "./subagents.js"
import { syncWebSearchConfig } from "./web-search.js"

const PI_GLOBAL_EXTENSIONS_DIR = join(homedir(), ".pi", "agent", "extensions")

const isGloballyInstalled = (extensionDirName: string): boolean => {
	return existsSync(join(PI_GLOBAL_EXTENSIONS_DIR, extensionDirName, "index.ts"))
}

const resolvePackageFile = (pkgName: string, relPath: string): string | null => {
	const require = createRequire(import.meta.url)
	try {
		const packageJsonPath = require.resolve(`${pkgName}/package.json`)
		return join(dirname(packageJsonPath), relPath)
	} catch {
		return null
	}
}

export interface PiExtensionBootstrapResult {
	extensionPaths: string[]
	configPaths: string[]
}

export const bootstrapPiExtensions = (): PiExtensionBootstrapResult => {
	const piAvailable = isPiAvailable()
	const extensionPaths = [
		isGloballyInstalled("web-access") ? null : resolvePackageFile("pi-web-access", "index.ts"),
		piAvailable && !isGloballyInstalled("subagent") ? resolvePackageFile("pi-subagents", "index.ts") : null,
		piAvailable && !isGloballyInstalled("subagent") ? resolvePackageFile("pi-subagents", "notify.ts") : null,
		!isGloballyInstalled("guardrails") ? resolvePackageFile("@aliou/pi-guardrails", "src/index.ts") : null,
	].filter((p): p is string => Boolean(p))

	if (!piAvailable) {
		console.warn("[openzosma/agents] pi CLI not found — subagent tools will not be available")
	}

	applySubagentEnv()

	const configPaths = [syncWebSearchConfig(), syncSubagentsConfig(), syncGuardrailsConfig()]
	syncSubagentDefinitions()

	return { extensionPaths, configPaths }
}
