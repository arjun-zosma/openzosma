import { describe, expect, it } from "vitest"
import { createTestApp } from "./helpers.js"

describe("GET /health", () => {
	it("returns 200 with status ok", async () => {
		const { app } = await createTestApp()
		const res = await app.request("/health")
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ status: "ok" })
	})
})
