import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentProvider, AgentSession, AgentSessionOpts, AgentStreamEvent } from "@openzosma/agents"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SessionManager } from "./session-manager.js"

/** Stub agent session that records opts and does nothing. */
class StubSession implements AgentSession {
	constructor(readonly opts: AgentSessionOpts) {}
	async *sendMessage(): AsyncGenerator<AgentStreamEvent> {}
	getMessages() {
		return []
	}
	async steer(_content: string): Promise<void> {}
	async followUp(_content: string): Promise<void> {}
}

/** Stub provider that captures createSession calls for inspection. */
class StubProvider implements AgentProvider {
	readonly id = "stub"
	readonly name = "Stub"
	calls: AgentSessionOpts[] = []

	createSession(opts: AgentSessionOpts): AgentSession {
		this.calls.push(opts)
		return new StubSession(opts)
	}
}

describe("SessionManager memory directory", () => {
	let tmpDir: string
	let savedEnv: string | undefined
	let provider: StubProvider

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "gw-test-"))
		savedEnv = process.env.OPENZOSMA_WORKSPACE
		process.env.OPENZOSMA_WORKSPACE = tmpDir
		provider = new StubProvider()
	})

	afterEach(() => {
		if (savedEnv === undefined) process.env.OPENZOSMA_WORKSPACE = undefined
		else process.env.OPENZOSMA_WORKSPACE = savedEnv
		rmSync(tmpDir, { recursive: true, force: true })
	})

	it("passes a stable memoryDir per agent config", async () => {
		const sm = new SessionManager({ provider })
		const configId = "cfg-abc-123"

		await sm.createSession("s1", configId)
		await sm.createSession("s2", configId)

		expect(provider.calls).toHaveLength(2)
		expect(provider.calls[0].memoryDir).toBe(join(tmpDir, "agents", configId, "memory"))
		expect(provider.calls[1].memoryDir).toBe(join(tmpDir, "agents", configId, "memory"))
		// Same memory dir despite different session IDs
		expect(provider.calls[0].memoryDir).toBe(provider.calls[1].memoryDir)
		// Different workspace dirs
		expect(provider.calls[0].workspaceDir).not.toBe(provider.calls[1].workspaceDir)
	})

	it("uses 'default' memory dir when no agentConfigId", async () => {
		const sm = new SessionManager({ provider })
		await sm.createSession("s1")

		expect(provider.calls[0].memoryDir).toBe(join(tmpDir, "agents", "default", "memory"))
	})

	it("creates memory directory on disk", async () => {
		const sm = new SessionManager({ provider })
		const configId = "cfg-xyz"
		await sm.createSession("s1", configId)

		const memDir = join(tmpDir, "agents", configId, "memory")
		expect(existsSync(memDir)).toBe(true)
	})

	it("different agent configs get different memory dirs", async () => {
		const sm = new SessionManager({ provider })
		await sm.createSession("s1", "config-a")
		await sm.createSession("s2", "config-b")

		expect(provider.calls[0].memoryDir).toBe(join(tmpDir, "agents", "config-a", "memory"))
		expect(provider.calls[1].memoryDir).toBe(join(tmpDir, "agents", "config-b", "memory"))
		expect(provider.calls[0].memoryDir).not.toBe(provider.calls[1].memoryDir)
	})
})
