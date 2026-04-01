import { describe, it, expect } from "vitest"
import { handleWebSocket } from "./ws.js"
import type { SessionManager } from "./session-manager.js"

// Minimal fake WebSocket implementation for tests
function createFakeWs() {
  const messages: string[] = []
  let handlers: Record<string, Function> = {}
  const ws: any = {
    OPEN: 1,
    readyState: 1,
    send: (data: string) => messages.push(data),
    on: (ev: string, cb: Function) => {
      handlers[ev] = cb
    },
    // helpers for tests:
    _emitMessage: (raw: Buffer | string) => {
      const cb = handlers["message"]
      if (!cb) throw new Error("no message handler")
      cb(raw)
    },
    _emitClose: () => {
      const cb = handlers["close"]
      if (cb) cb()
    },
    _messages: messages,
  }
  return ws
}

// Stub sessionManager with controllable sendMessage generator
function makeStubSessionManager(eventsPerCall: any[] = []) {
  return {
    sendMessage: async function* (sessionId: string, content: string, signal?: AbortSignal) {
      // Yield configured events; then wait until aborted (if signal provided)
      for (const e of eventsPerCall) {
        yield e
      }
      if (signal) {
        if (!signal.aborted) {
          await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))
        }
      }
    },
  } as unknown as SessionManager
}

describe("handleWebSocket", () => {
  it("responds pong to ping messages", () => {
    const ws = createFakeWs()
    const sm = makeStubSessionManager()
    handleWebSocket(ws, sm)

    ws._emitMessage(Buffer.from(JSON.stringify({ type: "ping" })))
    expect(ws._messages.length).toBeGreaterThan(0)
    const parsed = JSON.parse(ws._messages[0])
    expect(parsed).toEqual({ type: "pong" })
  })

  it("returns error for invalid JSON", () => {
    const ws = createFakeWs()
    const sm = makeStubSessionManager()
    handleWebSocket(ws, sm)

    ws._emitMessage("not a json")
    expect(ws._messages.length).toBeGreaterThan(0)
    const parsed = JSON.parse(ws._messages[0])
    expect(parsed.type).toBe("error")
    expect(parsed.error).toBe("Invalid JSON")
  })

  it("returns error for unknown message type", () => {
    const ws = createFakeWs()
    const sm = makeStubSessionManager()
    handleWebSocket(ws, sm)

    ws._emitMessage(Buffer.from(JSON.stringify({ type: "unknown" })))
    expect(ws._messages.length).toBeGreaterThan(0)
    const parsed = JSON.parse(ws._messages[0])
    expect(parsed.type).toBe("error")
    expect(parsed.error).toBe("Unknown message type")
  })

  it("forwards events from sessionManager.sendMessage for message type", async () => {
    const ws = createFakeWs()
    const events = [
      { type: "message_start", id: "m1" },
      { type: "message_update", text: "hello" },
      { type: "message_update", text: " world" },
    ]
    const sm = makeStubSessionManager(events)
    handleWebSocket(ws, sm)

    // send a message
    ws._emitMessage(Buffer.from(JSON.stringify({ type: "message", sessionId: "s1", content: "hi" })))

    // The handler is asynchronous; wait a tick
    await new Promise((r) => setTimeout(r, 10))

    // Messages should include the forwarded events
    const parsed = ws._messages.map((m: string) => JSON.parse(m))
    // since ping/pong may be present earlier, filter by type message_start
    const fwd = parsed.filter((p: any) => p.type === "message_start" || p.type === "message_update")
    expect(fwd.length).toBeGreaterThanOrEqual(3)
    expect(fwd[0].type).toBe("message_start")
    expect(fwd[1].type).toBe("message_update")
  })

  it("cancels an active turn when cancel message is received", async () => {
    const ws = createFakeWs()
    // create a sendMessage that yields one start event then waits for abort
    const sm = {
      sendMessage: async function* (sessionId: string, content: string, signal?: AbortSignal) {
        yield { type: "message_start", id: "m1" }
        // wait until aborted
        if (signal && !signal.aborted) {
          await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))
        }
      },
    } as unknown as SessionManager

    handleWebSocket(ws, sm)

    // start a message (this will create an active turn)
    ws._emitMessage(Buffer.from(JSON.stringify({ type: "message", sessionId: "s-cancel", content: "start" })))
    await new Promise((r) => setTimeout(r, 10))

    // send cancel
    ws._emitMessage(Buffer.from(JSON.stringify({ type: "cancel", sessionId: "s-cancel" })))
    await new Promise((r) => setTimeout(r, 10))

    // ensure we received the start event but no further updates
    const parsed = ws._messages.map((m: string) => JSON.parse(m))
    const starts = parsed.filter((p: any) => p.type === "message_start" && p.id === "m1")
    expect(starts.length).toBe(1)

    // after cancel, there should be no lingering active updates for this session
    // (we expect no extra message_update events)
    const updates = parsed.filter((p: any) => p.type === "message_update")
    expect(updates.length).toBe(0)
  })
})
