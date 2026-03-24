import type { Pool } from "@openzosma/db"
import { userSandboxQueries } from "@openzosma/db"

// ---------------------------------------------------------------------------
// Quota configuration
// ---------------------------------------------------------------------------

export interface QuotaConfig {
	/** Maximum number of active sandboxes across the entire instance. 0 = unlimited. */
	maxSandboxes: number
	/** Maximum number of sessions per user. 0 = unlimited. */
	maxSessionsPerUser: number
}

export const DEFAULT_QUOTA_CONFIG: QuotaConfig = {
	maxSandboxes: 0,
	maxSessionsPerUser: 0,
}

// ---------------------------------------------------------------------------
// Quota checks
// ---------------------------------------------------------------------------

/**
 * Check whether creating a new sandbox would exceed the global limit.
 *
 * Self-hosted, so quotas are instance-level (not per-tenant).
 * Returns an error message if the quota is exceeded, or null if OK.
 */
export async function checkSandboxQuota(pool: Pool, config: QuotaConfig): Promise<string | null> {
	if (config.maxSandboxes <= 0) return null

	const active = await userSandboxQueries.list(pool, "ready")
	const provisioning = await userSandboxQueries.list(pool, "provisioning")
	const total = active.length + provisioning.length

	if (total >= config.maxSandboxes) {
		return `Sandbox limit reached (${total}/${config.maxSandboxes}). Suspend or destroy idle sandboxes to free capacity.`
	}

	return null
}

/**
 * Check whether a user has exceeded their per-user session limit.
 * Returns an error message if exceeded, or null if OK.
 */
export function checkSessionQuota(config: QuotaConfig, currentSessionCount: number): string | null {
	if (config.maxSessionsPerUser <= 0) return null

	if (currentSessionCount >= config.maxSessionsPerUser) {
		return `Session limit reached (${currentSessionCount}/${config.maxSessionsPerUser}). Close existing sessions to create new ones.`
	}

	return null
}
