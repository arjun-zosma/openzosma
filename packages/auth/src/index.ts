// Auth
import type { createAuth } from "./auth.js"
export { createAuth, createAuthFromEnv } from "./auth.js"
export type { AuthConfig } from "./auth.js"

/** Convenience alias for the Better Auth instance returned by createAuth. */
export type Auth = ReturnType<typeof createAuth>

// API Key
export { generateApiKey, hashApiKey, validateApiKey } from "./api-key.js"
export type { ApiKeyValidationResult } from "./api-key.js"

// RBAC
export { hasPermission, getPermissions } from "./rbac.js"
export type { Role, Permission } from "./rbac.js"
