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

describe("Session routes", () => {
	let app: Hono
	let sm: StubSessionManager

	beforeEach(async () => {
		const ctx = await createTestApp()
		app = ctx.app
		sm = ctx.sessionManager
	})

	describe("POST /api/v1/sessions", () => {
		it("creates a session", async () => {
			const res = await app.request("/api/v1/sessions", { method: "POST" })
			expect(res.status).toBe(201)
			const body = (await res.json()) as Json
			expect(body).toHaveProperty("id")
			expect(body).toHaveProperty("createdAt")
		})
	})

	describe("GET /api/v1/sessions/:id", () => {
		it("returns session details", async () => {
			await sm.createSession("test-s1")
			const res = await app.request("/api/v1/sessions/test-s1")
			expect(res.status).toBe(200)
			const body = (await res.json()) as Json
			expect(body.id).toBe("test-s1")
			expect(body).toHaveProperty("messageCount")
		})

		it("returns 404 for unknown session", async () => {
			const res = await app.request("/api/v1/sessions/nonexistent")
			expect(res.status).toBe(404)
		})
	})

	describe("DELETE /api/v1/sessions/:id", () => {
		it("deletes an existing session", async () => {
			await sm.createSession("del-1")
			const res = await app.request("/api/v1/sessions/del-1", { method: "DELETE" })
			expect(res.status).toBe(200)
			expect(await res.json()).toEqual({ ok: true })
			expect(sm.getSession("del-1")).toBeUndefined()
		})

		it("returns 404 for unknown session", async () => {
			const res = await app.request("/api/v1/sessions/nonexistent", { method: "DELETE" })
			expect(res.status).toBe(404)
		})
	})

	describe("POST /api/v1/sessions/:id/messages", () => {
		it("sends a message and gets text response", async () => {
			await sm.createSession("msg-1")
			sm.messageEvents = [{ type: "message_update", text: "Hi there!" }]

			const res = await app.request("/api/v1/sessions/msg-1/messages", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: "Hello" }),
			})
			expect(res.status).toBe(200)
			const body = (await res.json()) as Json
			expect(body.role).toBe("assistant")
			expect(body.content).toBe("Hi there!")
		})

		it("returns 404 for unknown session", async () => {
			const res = await app.request("/api/v1/sessions/nope/messages", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: "Hello" }),
			})
			expect(res.status).toBe(404)
		})

		it("returns 400 when content is missing", async () => {
			await sm.createSession("msg-2")
			const res = await app.request("/api/v1/sessions/msg-2/messages", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			})
			expect(res.status).toBe(400)
		})
	})

	describe("GET /api/v1/sessions/:id/messages", () => {
		it("lists messages for a session", async () => {
			const session = await sm.createSession("list-1")
			session.messages.push({
				id: "m1",
				role: "user",
				content: "Hello",
				createdAt: new Date().toISOString(),
			})

			const res = await app.request("/api/v1/sessions/list-1/messages")
			expect(res.status).toBe(200)
			const body = (await res.json()) as Json[]
			expect(body).toHaveLength(1)
			expect(body[0].content).toBe("Hello")
		})

		it("returns 404 for unknown session", async () => {
			const res = await app.request("/api/v1/sessions/nope/messages")
			expect(res.status).toBe(404)
		})
	})
})
