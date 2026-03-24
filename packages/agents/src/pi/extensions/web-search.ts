import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { WEB_SEARCH_CONFIG } from "../config.js"
import type { WebSearchExtensionConfig } from "../extension-types.js"

export const getWebSearchConfigPath = (): string => {
	return join(homedir(), ".pi", "web-search.json")
}

export const buildWebSearchConfig = (base: WebSearchExtensionConfig = WEB_SEARCH_CONFIG): object => {
	return {
		...base,
		perplexityApiKey: process.env.PERPLEXITY_API_KEY,
		geminiApiKey: process.env.GEMINI_API_KEY,
	}
}

export const syncWebSearchConfig = (base: WebSearchExtensionConfig = WEB_SEARCH_CONFIG): string => {
	const configPath = getWebSearchConfigPath()
	mkdirSync(dirname(configPath), { recursive: true })
	writeFileSync(configPath, `${JSON.stringify(buildWebSearchConfig(base), null, 2)}\n`, "utf-8")
	return configPath
}
