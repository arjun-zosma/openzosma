import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SessionManager } from "./session-manager.js"

// Use the real SessionManager but stub provider to avoid creating real AgentSession
class StubProvider {
  constructor() {
    this.calls = []
  }
  createSession(opts) {
    this.calls.push(opts)
    return {
      async *sendMessage() {},
      getMessages() {
        return []
      },
    }
  }
}

describe("SessionManager attachments and decodeDataUrl", () => {
  let tmpDir
  let savedEnv
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sm-test-"))
    savedEnv = process.env.OPENZOSMA_WORKSPACE
    process.env.OPENZOSMA_WORKSPACE = tmpDir
  })
  afterEach(() => {
    if (savedEnv === undefined) process.env.OPENZOSMA_WORKSPACE = undefined
    else process.env.OPENZOSMA_WORKSPACE = savedEnv
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("decodeDataUrl accepts data:base64 and raw base64", () => {
    const sm = new SessionManager({ provider: new StubProvider() })
    const input = "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ=="
    const res = (sm as any).decodeDataUrl(input)
    expect(res.mimeType).toBe("text/plain")
    expect(res.buffer.toString()).toBe("Hello, World!")

    const raw = Buffer.from("abc123").toString("base64")
    const res2 = (sm as any).decodeDataUrl(raw)
    expect(res2.mimeType).toBe("application/octet-stream")
    expect(res2.buffer.toString("base64")).toBe(raw)
  })

  it("writes attachments to disk and disambiguates duplicate filenames", async () => {
    const sm = new SessionManager({ provider: new StubProvider() })
    const workspace = tmpDir
    // create a local session to cause workspace dir to be created
    const session = await sm.createSession("s1")
    const state = (sm as any).sessions.get(session.id)
    const workspaceDir = state.workspaceDir

    const base64 = Buffer.from("file content").toString("base64")
    const attachments = [
      { filename: "a.txt", dataUrl: `data:text/plain;base64,${base64}` },
      { filename: "a.txt", dataUrl: `data:text/plain;base64,${base64}` },
    ]

    const augmented = (sm as any).writeAttachmentsToDir(attachments, workspaceDir, "original content")
    expect(augmented).toContain("The user has attached the following files")
    expect(augmented).toContain("user-uploads/a.txt")
    // the second file should be disambiguated
    expect(augmented).toMatch(/a-1.txt|a-2.txt|a-\d+\.txt/)

    // verify files exist on disk
    const uploads = join(workspaceDir, "user-uploads")
    expect(existsSync(uploads)).toBe(true)
  })
})
