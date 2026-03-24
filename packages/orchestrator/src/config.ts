import type { OrchestratorConfig } from "./types.js"

/**
 * Load orchestrator config overrides from environment variables.
 *
 * Any variable that is not set (or empty) is omitted so that the
 * result can be spread over DEFAULT_CONFIG without clobbering defaults.
 */
export function loadConfigFromEnv(): Partial<OrchestratorConfig> {
	const config: Partial<OrchestratorConfig> = {}

	if (process.env.SANDBOX_IMAGE) {
		config.sandboxImage = process.env.SANDBOX_IMAGE
	}
	if (process.env.SANDBOX_POLICY_PATH) {
		config.defaultPolicyPath = process.env.SANDBOX_POLICY_PATH
	}
	if (process.env.SANDBOX_AGENT_PORT) {
		config.agentPort = Number(process.env.SANDBOX_AGENT_PORT)
	}
	if (process.env.SANDBOX_READY_TIMEOUT_MS) {
		config.sandboxReadyTimeoutMs = Number(process.env.SANDBOX_READY_TIMEOUT_MS)
	}
	if (process.env.SANDBOX_IDLE_SUSPEND_MS) {
		config.idleSuspendThresholdMs = Number(process.env.SANDBOX_IDLE_SUSPEND_MS)
	}
	if (process.env.SANDBOX_HEALTH_CHECK_INTERVAL_MS) {
		config.healthCheckIntervalMs = Number(process.env.SANDBOX_HEALTH_CHECK_INTERVAL_MS)
	}
	if (process.env.MAX_SANDBOXES) {
		config.maxSandboxes = Number(process.env.MAX_SANDBOXES)
	}

	return config
}
