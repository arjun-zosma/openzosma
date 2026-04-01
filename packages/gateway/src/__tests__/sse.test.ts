import type { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type StubSessionManager, createTestApp } from "./helpers.js"

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

describe("SSE stream routes", () => {
	let app: Hono
	let sm: StubSessionManager

	beforeEach(async () => {
		const ctx = await createTestApp()
		app = ctx.app
		sm = ctx.sessionManager
	})

	describe("GET /api/v1/sessions/:id/stream", () => {
		it("returns 404 for unknown session", async () => {
			const res = await app.request("/api/v1/sessions/nope/stream")
			expect(res.status).toBe(404)
		})

		it("returns SSE content-type for valid session", async () => {
			await sm.createSession("sse-1")
			sm.subscribeEvents = [{ type: "message_update", text: "streaming" }]

			const res = await app.request("/api/v1/sessions/sse-1/stream")
			expect(res.status).toBe(200)
			expect(res.headers.get("content-type")).toContain("text/event-stream")
		})

		it("streams events as SSE data lines", async () => {
			await sm.createSession("sse-2")
			sm.subscribeEvents = [
				{ type: "message_start", id: "m1" },
				{ type: "message_update", text: "hello" },
			]

			const res = await app.request("/api/v1/sessions/sse-2/stream")
			const text = await res.text()

			expect(text).toContain("data:")
			expect(text).toContain("message_start")
			expect(text).toContain("message_update")
		})
	})
})
