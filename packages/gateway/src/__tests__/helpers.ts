import type { Auth } from "@openzosma/auth"
import type { Pool } from "@openzosma/db"
import type { Hono } from "hono"
import { vi } from "vitest"
import type { SessionManager } from "../session-manager.js"
import type { GatewayEvent, Session } from "../types.js"

/** Recursive JSON type for test assertion casts. Avoids `any` while allowing nested access. */
// biome-ignore lint/suspicious/noExplicitAny: needed for flexible test JSON assertions
export type Json = Record<string, any>

/**
 * Minimal stub that satisfies the SessionManager interface used by createApp().
 * Operates entirely in-memory — no filesystem, no agent provider, no DB.
 */
export class StubSessionManager {
	sessions = new Map<string, Session>()
	kbFiles: Array<{ path: string; content: string; sizeBytes: number; modifiedAt: string }> = []
	/** Events yielded by sendMessage(). Override per test. */
	messageEvents: GatewayEvent[] = [{ type: "message_update", text: "Hello from stub" }]
	/** Events yielded by subscribe(). Override per test. */
	subscribeEvents: GatewayEvent[] = []

	async createSession(
		id?: string,
		_agentConfigId?: string,
		_resolvedConfig?: unknown,
		_userId?: string,
	): Promise<Session> {
		const sessionId = id ?? `stub-${Date.now()}`
		const existing = this.sessions.get(sessionId)
		if (existing) return existing

		const session: Session = {
			id: sessionId,
			createdAt: new Date().toISOString(),
			messages: [],
		}
		this.sessions.set(sessionId, session)
		return session
	}

	getSession(id: string): Session | undefined {
		return this.sessions.get(id)
	}

	deleteSession(id: string): boolean {
		return this.sessions.delete(id)
	}

	async *sendMessage(
		sessionId: string,
		_content: string,
		_signal?: AbortSignal,
		_userId?: string,
	): AsyncGenerator<GatewayEvent> {
		const session = this.sessions.get(sessionId)
		if (!session) {
			yield { type: "error", error: `Session ${sessionId} not found` }
			return
		}
		for (const event of this.messageEvents) {
			yield event
		}
	}

	async *subscribe(_sessionId: string, signal?: AbortSignal): AsyncGenerator<GatewayEvent> {
		for (const event of this.subscribeEvents) {
			if (signal?.aborted) return
			yield event
		}
	}

	async getSandboxInfo(_userId: string) {
		return null
	}

	async destroySandbox(_userId: string) {
		return false
	}

	async pushKBFile(_userId: string, _path: string, _content: string) {}
	async deleteKBFile(_userId: string, _path: string) {}

	async pullKB(_userId: string) {
		return this.kbFiles
	}

	async resolveUserByEmail(_email: string) {
		return null
	}
}

/** Create a mock Auth object that authenticates as the given user by default. */
export function createMockAuth(opts?: {
	userId?: string
	role?: string
	authenticated?: boolean
}): Auth {
	const userId = opts?.userId ?? "test-user-id"
	const role = opts?.role ?? "admin"
	const authenticated = opts?.authenticated ?? true

	return {
		api: {
			getSession: vi.fn().mockResolvedValue(authenticated ? { user: { id: userId, role } } : null),
		},
		handler: vi.fn().mockImplementation(() => new Response("ok")),
	} as unknown as Auth
}

/** Create a minimal mock Pool satisfying the type. */
export function createMockPool(): Pool {
	return { query: vi.fn() } as unknown as Pool
}

/**
 * Create a test Hono app with all dependencies stubbed.
 * Returns the app + all mocks for test manipulation.
 */
export async function createTestApp(opts?: {
	authenticated?: boolean
	userId?: string
	role?: string
	withPool?: boolean
}): Promise<{ app: Hono; sessionManager: StubSessionManager; pool: Pool | undefined; auth: Auth }> {
	const { createApp } = await import("../app.js")

	const sessionManager = new StubSessionManager()
	const pool = (opts?.withPool ?? true) ? createMockPool() : undefined
	const auth = createMockAuth({
		userId: opts?.userId ?? "test-user-id",
		role: opts?.role ?? "admin",
		authenticated: opts?.authenticated ?? true,
	})

	const app = createApp(sessionManager as unknown as SessionManager, pool, auth)

	return { app: app as unknown as Hono, sessionManager, pool, auth }
}
