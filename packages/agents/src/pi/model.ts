import { getEnvApiKey, getModel, getModels, getProviders } from "@mariozechner/pi-ai"
import type { Api, Model } from "@mariozechner/pi-ai"
import { DEFAULT_MODELS, PROVIDER_PREFERENCE } from "./config.js"

/**
 * Build a custom Model object for a local / OpenAI-compatible endpoint.
 *
 * Returns `undefined` when `OPENZOSMA_LOCAL_MODEL_URL` is not set.
 * The model uses the `openai-completions` API with conservative compat
 * settings that work with llama.cpp, Ollama, vLLM, and similar servers.
 */
const buildLocalModel = (): Model<"openai-completions"> | undefined => {
	const baseUrl = process.env.OPENZOSMA_LOCAL_MODEL_URL
	if (!baseUrl) return undefined

	const id = process.env.OPENZOSMA_LOCAL_MODEL_ID ?? "local-model"
	const name = process.env.OPENZOSMA_LOCAL_MODEL_NAME ?? `Local (${id})`
	const contextWindow = Number(process.env.OPENZOSMA_LOCAL_MODEL_CONTEXT_WINDOW) || 131072
	const maxTokens = Number(process.env.OPENZOSMA_LOCAL_MODEL_MAX_TOKENS) || 32768

	return {
		id,
		name,
		api: "openai-completions",
		provider: "local",
		baseUrl,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow,
		maxTokens,
		compat: {
			supportsDeveloperRole: false,
			supportsReasoningEffort: false,
			supportsStore: false,
			supportsUsageInStreaming: false,
			supportsStrictMode: false,
			maxTokensField: "max_tokens",
		},
	}
}

export interface ResolveModelOpts {
	/** Override provider (e.g. from agent_configs DB row). */
	provider?: string
	/** Override model ID (e.g. from agent_configs DB row). */
	model?: string
	/** Override base URL for OpenAI-compatible endpoints. */
	baseUrl?: string
}

/**
 * Resolve the model to use. Priority:
 * 1. Local model via OPENZOSMA_LOCAL_MODEL_URL env var
 * 2. Explicit overrides passed via `opts` (from agent_configs or session)
 * 3. Explicit OPENZOSMA_MODEL_PROVIDER + OPENZOSMA_MODEL_ID env vars
 * 4. Auto-detect from available API keys using PROVIDER_PREFERENCE order
 */
export const resolveModel = (opts?: ResolveModelOpts): { model: Model<Api>; apiKey: string } => {
	// --- Priority 1: Local OpenAI-compatible model ---
	const localModel = buildLocalModel()
	if (localModel) {
		const apiKey = process.env.OPENZOSMA_LOCAL_MODEL_API_KEY ?? "dummy"
		return { model: localModel as Model<Api>, apiKey }
	}

	// --- Priority 2: Explicit overrides from opts (e.g. agent_configs) ---
	if (opts?.baseUrl && opts?.model) {
		const customModel: Model<"openai-completions"> = {
			id: opts.model,
			name: `Custom (${opts.model})`,
			api: "openai-completions",
			provider: opts.provider ?? "custom",
			baseUrl: opts.baseUrl,
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 131072,
			maxTokens: 32768,
			compat: {
				supportsDeveloperRole: false,
				supportsReasoningEffort: false,
				supportsStore: false,
				supportsUsageInStreaming: false,
				supportsStrictMode: false,
				maxTokensField: "max_tokens",
			},
		}
		const apiKey = process.env.OPENZOSMA_LOCAL_MODEL_API_KEY ?? "dummy"
		return { model: customModel as Model<Api>, apiKey }
	}

	if (opts?.provider) {
		const modelId = opts.model ?? DEFAULT_MODELS[opts.provider]
		if (modelId) {
			const model = getModel(opts.provider as "anthropic", modelId as "claude-sonnet-4-20250514")
			if (model) {
				const apiKey = getEnvApiKey(opts.provider)
				if (apiKey) {
					return { model, apiKey }
				}
			}
		}
	}

	// --- Priority 3: Env var overrides ---
	const explicitProvider = process.env.OPENZOSMA_MODEL_PROVIDER
	const explicitModelId = process.env.OPENZOSMA_MODEL_ID

	if (explicitProvider) {
		const modelId = explicitModelId ?? DEFAULT_MODELS[explicitProvider]
		if (!modelId) {
			throw new Error(
				`OPENZOSMA_MODEL_PROVIDER is "${explicitProvider}" but no OPENZOSMA_MODEL_ID was set and no default model is known for this provider.`,
			)
		}
		const model = getModel(explicitProvider as "anthropic", modelId as "claude-sonnet-4-20250514")
		if (!model) {
			throw new Error(`Model ${explicitProvider}/${modelId} not found in model registry.`)
		}
		const apiKey = getEnvApiKey(explicitProvider)
		if (!apiKey) {
			throw new Error(`No API key found for provider "${explicitProvider}". Set the appropriate environment variable.`)
		}
		return { model, apiKey }
	}

	// --- Priority 4: Auto-detect from available API keys ---
	for (const provider of PROVIDER_PREFERENCE) {
		const apiKey = getEnvApiKey(provider)
		if (!apiKey) continue

		const modelId = explicitModelId ?? DEFAULT_MODELS[provider]
		if (!modelId) continue

		const model = getModel(provider as "anthropic", modelId as "claude-sonnet-4-20250514")
		if (!model) continue

		return { model, apiKey }
	}

	for (const provider of getProviders()) {
		const apiKey = getEnvApiKey(provider)
		if (!apiKey) continue

		const models = getModels(provider as "anthropic")
		if (models.length === 0) continue

		return { model: models[0] as Model<Api>, apiKey }
	}

	throw new Error(
		"No LLM provider configured. Set OPENZOSMA_LOCAL_MODEL_URL for a local model, OPENZOSMA_MODEL_PROVIDER for a cloud provider, or provide an API key (e.g. OPENAI_API_KEY, ANTHROPIC_API_KEY).",
	)
}
