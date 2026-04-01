import { apiKeyQueries } from "@openzosma/db"
import type { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type Json, createTestApp } from "./helpers.js"

vi.mock("@openzosma/auth", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@openzosma/auth")>()
	return {
		...actual,
		validateApiKey: vi.fn().mockResolvedValue({ valid: false }),
	}
})

vi.mock("@openzosma/a2a", () => ({
	buildDefaultAgentCard: vi.fn().mockResolvedValue(null),
}))

describe("API key routes", () => {
	let app: Hono

	beforeEach(async () => {
		const ctx = await createTestApp()
		app = ctx.app
	})

	describe("POST /api/v1/api-keys", () => {
		it("creates an API key", async () => {
			vi.spyOn(apiKeyQueries, "createApiKey").mockResolvedValue({
				id: "key-1",
				name: "test-key",
				keyHash: "hash",
				keyPrefix: "ozk_abc",
				scopes: [],
				createdAt: new Date(),
				lastUsedAt: null,
				expiresAt: null,
			} as Awaited<ReturnType<typeof apiKeyQueries.createApiKey>>)

			const res = await app.request("/api/v1/api-keys", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "test-key" }),
			})
			expect(res.status).toBe(201)
			const body = (await res.json()) as Json
			expect(body).toHaveProperty("id")
			expect(body).toHaveProperty("key")
			expect(body.key).toMatch(/^ozk_/)
		})

		it("returns 400 when name is missing", async () => {
			const res = await app.request("/api/v1/api-keys", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			})
			expect(res.status).toBe(400)
		})
	})

	describe("GET /api/v1/api-keys", () => {
		it("lists API keys", async () => {
			vi.spyOn(apiKeyQueries, "listApiKeys").mockResolvedValue([
				{
					id: "key-1",
					name: "test-key",
					keyHash: "hash",
					keyPrefix: "ozk_abc",
					scopes: ["sessions:read"],
					createdAt: new Date(),
					lastUsedAt: null,
					expiresAt: null,
				} as Awaited<ReturnType<typeof apiKeyQueries.listApiKeys>>[number],
			])

			const res = await app.request("/api/v1/api-keys")
			expect(res.status).toBe(200)
			const body = (await res.json()) as Json
			expect(body.keys).toHaveLength(1)
			expect(body.keys[0].keyPrefix).toBe("ozk_abc")
		})
	})

	describe("DELETE /api/v1/api-keys/:id", () => {
		it("deletes an API key", async () => {
			vi.spyOn(apiKeyQueries, "deleteApiKey").mockResolvedValue(undefined as never)

			const res = await app.request("/api/v1/api-keys/key-1", { method: "DELETE" })
			expect(res.status).toBe(200)
			expect(await res.json()).toEqual({ ok: true })
		})
	})
})
