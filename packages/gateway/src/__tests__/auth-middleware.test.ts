import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SessionManager } from "../session-manager.js"
import { type Json, StubSessionManager, createMockAuth, createMockPool, createTestApp } from "./helpers.js"

const mockValidateApiKey = vi.fn()

vi.mock("@openzosma/auth", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@openzosma/auth")>()
	return {
		...actual,
		validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
	}
})

vi.mock("@openzosma/a2a", () => ({
	buildDefaultAgentCard: vi.fn().mockResolvedValue(null),
}))

describe("Auth middleware", () => {
	beforeEach(() => {
		mockValidateApiKey.mockReset()
		mockValidateApiKey.mockResolvedValue({ valid: false })
	})

	it("rejects unauthenticated requests with 401", async () => {
		const { app } = await createTestApp({ authenticated: false })

		const res = await app.request("/api/v1/sessions/test-id")
		expect(res.status).toBe(401)
		const body = (await res.json()) as Json
		expect(body.error.code).toBe("AUTH_REQUIRED")
	})

	it("accepts valid API key", async () => {
		mockValidateApiKey.mockResolvedValue({
			valid: true,
			keyId: "key-1",
			scopes: ["sessions:read", "sessions:write"],
		})

		const { app, sessionManager } = await createTestApp({ authenticated: false })
		await sessionManager.createSession("s1")

		const res = await app.request("/api/v1/sessions/s1", {
			headers: { Authorization: "Bearer ozk_test123" },
		})
		expect(res.status).toBe(200)
	})

	it("rejects invalid API key with 401", async () => {
		mockValidateApiKey.mockResolvedValue({ valid: false })

		const { app } = await createTestApp({ authenticated: false })

		const res = await app.request("/api/v1/sessions/test-id", {
			headers: { Authorization: "Bearer ozk_invalid" },
		})
		expect(res.status).toBe(401)
		const body = (await res.json()) as Json
		expect(body.error.code).toBe("INVALID_API_KEY")
	})

	it("accepts valid session cookie (Better Auth)", async () => {
		const { app, sessionManager } = await createTestApp({ authenticated: true })
		await sessionManager.createSession("s1")

		const res = await app.request("/api/v1/sessions/s1")
		expect(res.status).toBe(200)
	})

	it("rejects API key missing required scope with 403", async () => {
		mockValidateApiKey.mockResolvedValue({
			valid: true,
			keyId: "key-2",
			scopes: ["sessions:read"], // missing sessions:write
		})

		const { app } = await createTestApp({ authenticated: false })

		const res = await app.request("/api/v1/sessions", {
			method: "POST",
			headers: { Authorization: "Bearer ozk_limited" },
		})
		expect(res.status).toBe(403)
		const body = (await res.json()) as Json
		expect(body.error.code).toBe("FORBIDDEN")
	})

	it("allows API key with correct scope", async () => {
		mockValidateApiKey.mockResolvedValue({
			valid: true,
			keyId: "key-3",
			scopes: ["sessions:write"],
		})

		const { app } = await createTestApp({ authenticated: false })

		const res = await app.request("/api/v1/sessions", {
			method: "POST",
			headers: { Authorization: "Bearer ozk_full" },
		})
		expect(res.status).toBe(201)
	})

	it("rejects member role for api_keys:write with 403", async () => {
		const { app } = await createTestApp({ role: "member" })

		const res = await app.request("/api/v1/api-keys", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "test-key" }),
		})
		expect(res.status).toBe(403)
		const body = (await res.json()) as Json
		expect(body.error.code).toBe("FORBIDDEN")
	})

	it("allows admin role for api_keys:write", async () => {
		const { createApp } = await import("../app.js")
		const sm = new StubSessionManager()
		const pool = createMockPool()
		const auth = createMockAuth({ role: "admin" })

		const { apiKeyQueries } = await import("@openzosma/db")
		vi.spyOn(apiKeyQueries, "createApiKey").mockResolvedValue({
			id: "key-new",
			name: "test",
			keyHash: "hash",
			keyPrefix: "ozk_test12345",
			scopes: [],
			createdAt: new Date(),
			lastUsedAt: null,
			expiresAt: null,
		} as Awaited<ReturnType<typeof apiKeyQueries.createApiKey>>)

		const app = createApp(sm as unknown as SessionManager, pool, auth)

		const res = await app.request("/api/v1/api-keys", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "test-key" }),
		})
		expect(res.status).toBe(201)
	})
})
