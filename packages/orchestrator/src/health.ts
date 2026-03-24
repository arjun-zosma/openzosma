import type { SandboxManager } from "./sandbox-manager.js"

/**
 * Background health check loop for sandbox monitoring.
 *
 * Periodically:
 * 1. Checks health of all active sandboxes
 * 2. Suspends sandboxes that have been idle beyond the threshold
 *
 * Returns a stop function to cancel the loop.
 */
export function startHealthCheckLoop(
	sandboxManager: SandboxManager,
	intervalMs: number,
	opts?: {
		onHealthCheckComplete?: (unhealthy: string[]) => void
		onIdleSuspended?: (suspended: string[]) => void
		onError?: (err: unknown) => void
	},
): () => void {
	let stopped = false

	const tick = async () => {
		if (stopped) return

		try {
			// Health check all active sandboxes
			const unhealthy = await sandboxManager.healthCheckAll()
			if (unhealthy.length > 0) {
				opts?.onHealthCheckComplete?.(unhealthy)
			}

			// Suspend idle sandboxes
			const suspended = await sandboxManager.suspendIdleSandboxes()
			if (suspended.length > 0) {
				opts?.onIdleSuspended?.(suspended)
			}
		} catch (err) {
			opts?.onError?.(err)
		}
	}

	const timer = setInterval(tick, intervalMs)

	// Run first check immediately
	void tick()

	return () => {
		stopped = true
		clearInterval(timer)
	}
}
