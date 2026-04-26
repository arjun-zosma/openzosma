# Memory Integration

Technical plan to wire `@openzosma/zosma-mem` into the agent session lifecycle so
memories persist and are recalled across conversations.

Last updated: 2026-04-09

---

## Problem

The zosma-mem package has a fully working memory engine (ingest, retrieve, salience
scoring, co-access graph, GC, versioned entity store). But **nothing calls it**.

- `bootstrapMemory()` sets `PI_MEMORY_DIR` but no extension reads it
- The old extensions (`pi-memory`, `pi-extension-observational-memory`) were removed
  but never replaced
- The new packages (`pi-brain`, `pi-dcp`) referenced in `NEW-MEMORY-INTEGRATION.md`
  were never installed or integrated
- No code ingests facts from conversations into the engine
- No code retrieves memories at session start and injects them into context
- `systemPromptSuffix` is computed in session-manager.ts but never consumed by pi.agent.ts

Result: the agent is stateless across conversations. It cannot remember anything.

---

## Current State

### What exists and works

| Component | Status |
|---|---|
| `packages/zosma-mem/src/engine/` | Working — factory, salience, reinforcement |
| `packages/zosma-mem/src/store/` | Working — EntityStore (file-based), co-access graph |
| `packages/zosma-mem/src/retrieval/` | Working — attention-scored retrieval with co-access boost |
| `packages/zosma-mem/src/ingestion/` | Working — event ingestion with salience threshold |
| `packages/zosma-mem/src/gc/` | Working — decay, pruning, version compaction |
| Stable memoryDir per agent config | Working — gateway session-manager.ts computes it |
| Memory dir creation | Working — mkdirSync in session-manager.ts |

### What is missing

| Component | Status |
|---|---|
| `pi-brain` (npm) | Not installed. Needed for structured memory entities |
| `pi-dcp` (npm) | Not installed. Needed for dynamic context pruning / GC |
| Ingestion hook | Missing. Nothing extracts facts from conversations |
| Retrieval-at-session-start | Missing. Nothing loads memories into context |
| Reinforcement tracking | Missing. No read/ignore/decision signals from agent |
| systemPromptSuffix wiring | Bug. Computed but never passed to pi.agent.ts |

---

## Architecture (Target)

```
┌────────────────────────────────────────────────────────────────────┐
│  Agent Session                                                      │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │  pi-brain         │  │  pi-dcp           │  │  zosma-mem      │  │
│  │  (pi extension)   │  │  (pi extension)   │  │  engine         │  │
│  │                   │  │                   │  │                  │  │
│  │  Structured       │  │  Context pruning  │  │  Salience       │  │
│  │  memory entities  │  │  Token management │  │  Retrieval      │  │
│  │  Versioning       │  │  GC scheduling    │  │  Co-access      │  │
│  │  pi hooks/tools   │  │                   │  │  Reinforcement  │  │
│  └────────┬──────────┘  └──────────────────┘  └────────┬────────┘  │
│           │                                             │           │
│           └─────────────── zosma-mem-bridge ────────────┘           │
│                        (new integration layer)                      │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Filesystem: workspace/agents/<configId>/memory/             │  │
│  │  ├── .salience/*.yaml                                        │  │
│  │  ├── .salience/archive/                                      │  │
│  │  ├── .salience/co-access                                     │  │
│  │  └── (pi-brain managed files)                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## Integration Steps

### Step 1: Install missing npm packages

Install `pi-brain` and `pi-dcp` as dependencies of `@openzosma/zosma-mem`:

```bash
cd packages/zosma-mem
pnpm add pi-brain pi-dcp
```

Verify both packages export a default pi extension function. Check their `index.ts`
entry points in `node_modules/` for the hooks they register and any configuration
they expect.

---

### Step 2: Create the bridge package

Create `packages/zosma-mem/src/bridge/` — the integration layer between the zosma-mem
engine and the pi extension system.

#### File: `packages/zosma-mem/src/bridge/index.ts`

Exports:
- `createMemoryBridge(config: BridgeConfig): MemoryBridge`
- `resolveMemoryExtensionPaths(): { paths: string[], missing: string[] }`

#### Interface: `BridgeConfig`

```ts
interface BridgeConfig {
  memoryDir: string         // Stable per-agent-config directory
  salienceThreshold?: number // Min salience to persist (default from engine)
  topK?: number             // How many memories to retrieve (default: 8)
}
```

#### Interface: `MemoryBridge`

```ts
interface MemoryBridge {
  /** Called before each turn. Returns memory context string for injection. */
  loadContext: (userMessage: string) => Promise<string>

  /** Called after each turn. Extracts and ingests memorable facts. */
  ingestFacts: (facts: ExtractedFact[]) => Promise<void>

  /** Called when agent uses a retrieved memory. Reinforcement signal. */
  recordUsage: (entityId: string, signal: "used" | "ignored" | "influenced_decision") => Promise<void>

  /** Run GC. Called on session end. */
  gc: () => Promise<void>

  /** Shutdown — clear timers, flush state. */
  shutdown: () => void

  /** Return all entity IDs (for testing). */
  listEntityIds: () => Promise<string[]>
}
```

---

### Step 3: Implement `loadContext`

Called before each agent turn to retrieve relevant memories:

```ts
const loadContext = async (userMessage: string): Promise<string> => {
  const results = await engine.retrieve({ taskDescription: userMessage }, topK)

  if (results.length === 0) return ""

  const memories = results.map(r => ({
    id: r.entity.id,
    content: r.entity.content,
    score: r.attentionScore
  }))

  const lines = [
    "## Long-term Memory",
    "",
    "The following facts have been remembered from previous conversations with this user.",
    "Use them to inform your responses naturally, without mentioning memory IDs or scores.",
    "",
    ...memories.map(m => `- ${m.content}`),
    ""
  ]

  return lines.join("\n")
}
```

---

### Step 4: Implement `ingestFacts`

Called after each assistant turn with pre-extracted facts:

```ts
const ingestFacts = async (facts: ExtractedFact[]): Promise<void> => {
  const now = Date.now()
  for (const fact of facts) {
    await engine.ingest({
      id: factId(fact.content),  // deterministic hash
      type: fact.type,
      content: fact.content,
      tags: fact.tags,
      timestamp: now,
    })
  }
}
```

---

### Step 5: Wire the bridge into PiAgentSession

Edit `packages/agents/src/pi.agent.ts`:

#### 5a. Import and create the bridge

```ts
import { createMemoryBridge, resolveMemoryExtensionPaths } from "@openzosma/zosma-mem/bridge"
```

In the `PiAgentSession` constructor:

```ts
this.memoryBridge = createMemoryBridge({ memoryDir: opts.memoryDir ?? defaultPath })
```

#### 5b. Per-turn retrieval

Before each `sendMessage()`, inject memory context:

```ts
const memoryContext = await this.memoryBridge.loadContext(content)
if (memoryContext) {
  await session.steer(memoryContext)  // Inject before prompt
}
```

#### 5c. Post-turn ingestion

After each turn completes:

```ts
const facts = await extractFacts(model, apiKey, userMessage, assistantResponse)
await this.memoryBridge.ingestFacts(facts)
```

#### 5d. Load pi-brain and pi-dcp

```ts
const { paths: memoryExtensionPaths, missing } = resolveMemoryExtensionPaths()
if (missing.length > 0) log.warn("Memory extensions missing:", missing)

const resourceLoader = new DefaultResourceLoader({
  cwd: opts.workspaceDir,
  systemPrompt: finalPrompt,
  additionalExtensionPaths: memoryExtensionPaths,
})
```

#### 5e. Fix systemPromptSuffix

```ts
const parts = [opts.systemPromptPrefix, basePrompt, opts.systemPromptSuffix].filter(Boolean)
const finalPrompt = parts.join("\n\n")
```

#### 5f. Session cleanup

```ts
await this.memoryBridge.gc()
this.memoryBridge.shutdown()
```

---

### Step 6: LLM-based fact extraction

Create `packages/agents/src/pi/memory.ts` with `extractFacts()` that uses the session's
LLM to identify memorable facts from conversation exchanges.

---

### Step 7: Tests

Create `packages/zosma-mem/src/bridge/__tests__/bridge.test.ts` with integration tests
for the full ingest→retrieve→reinforce lifecycle.

---

## Implementation Status

### ✅ Completed

- [x] Installed pi-brain, pi-dcp as zosma-mem deps
- [x] Created bridge package with `createMemoryBridge` and `resolveMemoryExtensionPaths`
- [x] Implemented `loadContext` with proper formatting
- [x] Implemented `ingestFacts` with fact ID hashing
- [x] Wired bridge into `PiAgentSession` (per-turn injection via `steer()`, post-turn ingestion)
- [x] Fixed `systemPromptSuffix` bug in prompt construction
- [x] Load pi-brain and pi-dcp extensions via `additionalExtensionPaths`
- [x] Session cleanup with GC and shutdown
- [x] LLM-based fact extraction in separate agents module
- [x] Cleaned dead code (evals, adapter, bootstrap, config.ts)

### ⏳ Remaining

- [ ] Add reinforcement tracking (when agent uses retrieved memories)
- [ ] Complete bridge tests
- [ ] Manual testing: cross-conversation recall

---

## Files Created/Modified

| File | Status | Purpose |
|---|---|---|
| `packages/zosma-mem/package.json` | ✅ Modified | Added pi-brain/pi-dcp deps, removed evals export/bin |
| `packages/zosma-mem/src/bridge/index.ts` | ✅ Created | Bridge factory + MemoryBridge implementation |
| `packages/zosma-mem/src/bridge/extensions.ts` | ✅ Created | Extension path resolution for pi-brain/pi-dcp |
| `packages/zosma-mem/src/bridge/__tests__/bridge.test.ts` | ⏳ Partial | Bridge unit tests (6 basic tests pass) |
| `packages/agents/src/pi.agent.ts` | ✅ Modified | Wired bridge, fixed suffix bug, load extensions |
| `packages/agents/src/pi/memory.ts` | ✅ Created | LLM-based fact extraction |
| `packages/zosma-mem/README.md` | ✅ Updated | Reflects current package purpose |

---

## Non-Goals

- No database storage. Memory stays file-based.
- No cross-session real-time sync. Each session reads its own files.
- No embedding model. Retrieval uses tag-based attention scoring.
- No changes to gateway/session-manager (memoryDir wiring works).
- No removal of zosma-mem engine. Bridge wraps it.

---

## Architecture (Actual Implementation)

```
┌────────────────────────────────────────────────────────────────────┐
│  Agent Session (PiAgentSession)                                    │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │  pi-brain         │  │  pi-dcp           │  │  zosma-mem      │  │
│  │  (loaded via      │  │  (loaded via      │  │  bridge         │  │
│  │   additionalExt)  │  │   additionalExt)  │  │                 │  │
│  │                   │  │                   │  │  loadContext()   │  │
│  │  Code project     │  │  Context pruning  │  │  ingestFacts()  │  │
│  │  memory           │  │  Token management │  │  recordUsage()  │  │
│  │                   │  │                   │  │  gc()            │  │
│  └────────┬──────────┘  └──────────────────┘  └────────┬────────┘  │
│           │                                             │           │
│           └─────────────────────────────────────────────┘           │
│              zosma-mem engine (salience, store, gc)                 │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Filesystem: workspace/agents/<configId>/memory/             │  │
│  │  ├── .salience/*.yaml (entities)                             │  │
│  │  ├── .salience/archive/ (pruned)                             │  │
│  │  └── .salience/co-access (patterns)                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```