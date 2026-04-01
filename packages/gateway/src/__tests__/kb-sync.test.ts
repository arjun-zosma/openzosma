import type { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type Json, type StubSessionManager, createTestApp } from "./helpers.js"

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

describe("KB sync routes", () => {
	let app: Hono
	let sm: StubSessionManager

	beforeEach(async () => {
		const ctx = await createTestApp()
		app = ctx.app
		sm = ctx.sessionManager
	})

	describe("POST /api/v1/kb/sync", () => {
		it("pushes a KB file (write action)", async () => {
			const pushSpy = vi.spyOn(sm, "pushKBFile")

			const res = await app.request("/api/v1/kb/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "write", path: "notes.md", content: "# Notes" }),
			})
			expect(res.status).toBe(200)
			expect(await res.json()).toEqual({ ok: true })
			expect(pushSpy).toHaveBeenCalledWith("test-user-id", "notes.md", "# Notes")
		})

		it("deletes a KB file (delete action)", async () => {
			const deleteSpy = vi.spyOn(sm, "deleteKBFile")

			const res = await app.request("/api/v1/kb/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "delete", path: "notes.md" }),
			})
			expect(res.status).toBe(200)
			expect(await res.json()).toEqual({ ok: true })
			expect(deleteSpy).toHaveBeenCalledWith("test-user-id", "notes.md")
		})

		it("rejects missing action or path", async () => {
			const res = await app.request("/api/v1/kb/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "write" }),
			})
			expect(res.status).toBe(400)
		})

		it("rejects write without content", async () => {
			const res = await app.request("/api/v1/kb/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "write", path: "notes.md" }),
			})
			expect(res.status).toBe(400)
		})

		it("rejects unknown action", async () => {
			const res = await app.request("/api/v1/kb/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "move", path: "notes.md" }),
			})
			expect(res.status).toBe(400)
		})

		it("returns 400 when no userId (API key auth without userId)", async () => {
			const mockValidateApiKey = (await import("@openzosma/auth")).validateApiKey as ReturnType<typeof vi.fn>
			mockValidateApiKey.mockResolvedValue({
				valid: true,
				keyId: "key-1",
				scopes: ["sessions:write"],
			})

			const { app: apiKeyApp } = await createTestApp({ authenticated: false })

			const res = await apiKeyApp.request("/api/v1/kb/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer ozk_testkey",
				},
				body: JSON.stringify({ action: "write", path: "notes.md", content: "# Test" }),
			})
			expect(res.status).toBe(400)
		})
	})

	describe("GET /api/v1/kb/pull", () => {
		it("pulls KB files", async () => {
			sm.kbFiles = [{ path: "notes.md", content: "# Notes", sizeBytes: 7, modifiedAt: "2026-01-01T00:00:00Z" }]

			const res = await app.request("/api/v1/kb/pull")
			expect(res.status).toBe(200)
			const body = (await res.json()) as Json
			expect(body.files).toHaveLength(1)
			expect(body.files[0].path).toBe("notes.md")
		})
	})
})
