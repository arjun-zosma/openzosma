import { agentConfigQueries } from "@openzosma/db"
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

describe("Agent config routes", () => {
	let app: Hono

	beforeEach(async () => {
		const ctx = await createTestApp()
		app = ctx.app
	})

	describe("GET /api/v1/agents", () => {
		it("lists agent configs", async () => {
			vi.spyOn(agentConfigQueries, "listAgentConfigs").mockResolvedValue([
				{
					id: "agent-1",
					name: "Test Agent",
					description: "A test agent",
					model: "claude-sonnet-4-20250514",
					provider: "anthropic",
					skills: ["code"],
					createdAt: new Date("2026-01-01"),
					systemPrompt: null,
					systemPromptPrefix: null,
					toolsEnabled: null,
					maxTokens: null,
					temperature: null,
					updatedAt: new Date("2026-01-01"),
				} as unknown as Awaited<ReturnType<typeof agentConfigQueries.listAgentConfigs>>[number],
			])

			const res = await app.request("/api/v1/agents")
			expect(res.status).toBe(200)
			const body = (await res.json()) as Json
			expect(body.agents).toHaveLength(1)
			expect(body.agents[0].name).toBe("Test Agent")
		})
	})

	describe("GET /api/v1/agents/:id", () => {
		it("returns a single agent config", async () => {
			vi.spyOn(agentConfigQueries, "getAgentConfig").mockResolvedValue({
				id: "agent-1",
				name: "Test Agent",
				description: "A test agent",
				model: "claude-sonnet-4-20250514",
				provider: "anthropic",
				skills: ["code"],
				systemPrompt: "You are a test agent",
				systemPromptPrefix: null,
				toolsEnabled: null,
				maxTokens: null,
				temperature: null,
				createdAt: new Date("2026-01-01"),
				updatedAt: new Date("2026-01-01"),
			} as unknown as Awaited<ReturnType<typeof agentConfigQueries.getAgentConfig>>)

			const res = await app.request("/api/v1/agents/agent-1")
			expect(res.status).toBe(200)
			const body = (await res.json()) as Json
			expect(body.id).toBe("agent-1")
			expect(body.name).toBe("Test Agent")
		})

		it("returns 404 for unknown agent config", async () => {
			vi.spyOn(agentConfigQueries, "getAgentConfig").mockResolvedValue(null)

			const res = await app.request("/api/v1/agents/nonexistent")
			expect(res.status).toBe(404)
		})
	})
})
