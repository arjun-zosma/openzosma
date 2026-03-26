import path from "node:path"
import { GATEWAY_URL, KNOWLEDGE_BASE_PATH } from "./constants"

/**
 * Resolve a user-supplied relative path within the knowledge base root directory.
 * Returns the absolute path if it stays within KNOWLEDGE_BASE_PATH, or null if
 * the resolved path escapes the root (e.g. via path traversal like "../../etc/passwd").
 */
export const resolveSafe = (userPath: string): string | null => {
	const resolved = path.resolve(KNOWLEDGE_BASE_PATH, userPath)
	if (!resolved.startsWith(path.resolve(KNOWLEDGE_BASE_PATH))) return null
	return resolved
}

/**
 * Fire-and-forget sync of a KB file change to the gateway.
 *
 * In orchestrator mode, the gateway pushes the change into the running sandbox.
 * In local mode (symlinks), the gateway is a no-op. Either way, failures here
 * should not block the dashboard's local write — they are logged but not thrown.
 *
 * @param cookie  The cookie header from the incoming request (for auth forwarding).
 * @param action  "write" or "delete".
 * @param kbPath  Relative path within the knowledge base.
 * @param content File content (required for "write", ignored for "delete").
 */
export const syncToGateway = async (
	cookie: string,
	action: "write" | "delete",
	kbPath: string,
	content?: string,
): Promise<void> => {
	try {
		await fetch(`${GATEWAY_URL}/api/v1/kb/sync`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				cookie,
			},
			body: JSON.stringify({ action, path: kbPath, content }),
		})
	} catch (err) {
		console.error("[knowledge-base] syncToGateway failed (%s %s):", action, kbPath, err)
	}
}
