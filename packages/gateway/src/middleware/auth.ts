import type { Auth } from "@openzosma/auth"
import { hasPermission, validateApiKey } from "@openzosma/auth"
import type { Role } from "@openzosma/auth"
import type { Pool } from "@openzosma/db"
import type { MiddlewareHandler } from "hono"

/**
 * Auth middleware for /api/v1/* routes.
 *
 * Supports two auth schemes checked in order:
 *  1. API key — `Authorization: Bearer ozk_*`. Validated via SHA-256 hash
 *     lookup. If the header is present and starts with `ozk_` but is invalid,
 *     the request is rejected immediately (no fallback to session cookie).
 *  2. Better Auth session cookie — parsed by Better Auth's `getSession`.
 *
 * On success, sets context variables:
 *  - `userId` (string)        — set when authenticated via session cookie
 *  - `userRole` (Role)        — user role from the users table (default: "member")
 *  - `apiKeyId` (string)      — set when authenticated via API key
 *  - `apiKeyScopes` (string[]) — scopes granted to the API key
 */
export const createAuthMiddleware = (auth: Auth, pool: Pool): MiddlewareHandler => {
	return async (c, next) => {
		const authHeader = c.req.header("Authorization")

		if (authHeader) {
			const token = authHeader.replace(/^Bearer\s+/i, "")

			if (token.startsWith("ozk_")) {
				const result = await validateApiKey(pool, token)
				if (result.valid) {
					c.set("apiKeyId", result.keyId)
					c.set("apiKeyScopes", result.scopes)
					return next()
				}
				return c.json({ error: { code: "INVALID_API_KEY", message: "Invalid or expired API key" } }, 401)
			}
		}

		const session = await auth.api.getSession({ headers: c.req.raw.headers })
		if (session) {
			c.set("userId", session.user.id)
			const role = ((session.user as Record<string, unknown>).role as Role) ?? "member"
			c.set("userRole", role)
			return next()
		}

		return c.json({ error: { code: "AUTH_REQUIRED", message: "Authentication required" } }, 401)
	}
}

/**
 * Middleware factory that enforces RBAC for session-based auth and
 * scope checking for API-key-based auth.
 *
 * For session users: checks hasPermission(userRole, resource, action).
 * For API key users: checks if apiKeyScopes includes "resource:action".
 */
export const requirePermission = (resource: string, action: string): MiddlewareHandler => {
	return async (c, next) => {
		const apiKeyId = c.get("apiKeyId") as string | undefined
		if (apiKeyId) {
			const scopes = (c.get("apiKeyScopes") as string[]) ?? []
			const requiredScope = `${resource}:${action}`
			if (!scopes.includes(requiredScope)) {
				return c.json(
					{ error: { code: "FORBIDDEN", message: `API key missing required scope: ${requiredScope}` } },
					403,
				)
			}
			return next()
		}

		const role = c.get("userRole") as Role | undefined
		if (!role || !hasPermission(role, resource, action)) {
			return c.json(
				{ error: { code: "FORBIDDEN", message: `Insufficient permissions for ${resource}:${action}` } },
				403,
			)
		}
		return next()
	}
}
