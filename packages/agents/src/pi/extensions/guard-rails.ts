import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { GUARDRAILS_CONFIG } from "../config.js"
import type { GuardrailsExtensionConfig } from "../extension-types.js"

export const getGuardrailsConfigPath = (): string => {
	return join(homedir(), ".pi", "agent", "extensions", "guardrails.json")
}

export const syncGuardrailsConfig = (config: GuardrailsExtensionConfig = GUARDRAILS_CONFIG): string => {
	const configPath = getGuardrailsConfigPath()
	mkdirSync(dirname(configPath), { recursive: true })
	writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
	return configPath
}
