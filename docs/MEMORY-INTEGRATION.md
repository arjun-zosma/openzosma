# OpenZosma Agent Memory System

Technical reference for how agent memory works in OpenZosma. Covers every layer from the
Kubernetes pod filesystem through the pi extension hooks to the LLM context window.

Last updated: 2026-03-23

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Package Map](#2-package-map)
3. [Memory Classification](#3-memory-classification)
4. [Filesystem Layout](#4-filesystem-layout)
5. [Bootstrap Sequence](#5-bootstrap-sequence)
6. [Pi Extension: pi-memory](#6-pi-extension-pi-memory)
7. [Pi Extension: pi-extension-observational-memory](#7-pi-extension-pi-extension-observational-memory)
8. [Orchestration Package: @openzosma/memory](#8-orchestration-package-openzosmamemory)
9. [Agent Integration: @openzosma/agents](#9-agent-integration-openzosmaagents)
10. [K3s Pod Lifecycle and Persistence](#10-k3s-pod-lifecycle-and-persistence)
11. [Context Window Flow](#11-context-window-flow)
12. [Tools Available to the Agent](#12-tools-available-to-the-agent)
13. [Search and Retrieval (qmd)](#13-search-and-retrieval-qmd)
14. [Compaction and Observation](#14-compaction-and-observation)
15. [Configuration Reference](#15-configuration-reference)
16. [Failure Modes and Degraded Operation](#16-failure-modes-and-degraded-operation)
17. [What This System Does Not Do](#17-what-this-system-does-not-do)

---

## 1. Architecture Overview

The memory system is **filesystem-native**. All memory state lives inside the agent's sandbox
pod as plain markdown and JSON files. There are no database tables, no Valkey keys, and no
external services involved in memory storage or retrieval.

Three packages collaborate:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Pod (K3s)                              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  pi-coding-agent session                                 │    │
│  │                                                          │    │
│  │  ┌──────────────┐   ┌──────────────────────────────┐    │    │
│  │  │  pi-memory    │   │  pi-extension-observational- │    │    │
│  │  │  (extension)  │   │  memory (extension)          │    │    │
│  │  │              │   │                               │    │    │
│  │  │  Storage     │   │  Compaction                   │    │    │
│  │  │  Retrieval   │   │  Observer/Reflector           │    │    │
│  │  │  Injection   │   │  Auto-GC                      │    │    │
│  │  │  Tools       │   │  Priority tagging             │    │    │
│  │  └──────┬───────┘   └──────────────┬───────────────┘    │    │
│  │         │                           │                    │    │
│  │         └─────────┬─────────────────┘                    │    │
│  │                   │                                      │    │
│  │         ┌─────────▼─────────┐                            │    │
│  │         │  Filesystem (PV)  │                            │    │
│  │         │  .pi/agent/memory │                            │    │
│  │         └───────────────────┘                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  @openzosma/memory (bootstrap, config, env)              │    │
│  │  @openzosma/agents (wires everything together)           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Key principle:** It orchestrates two
proven pi extensions and configures them for the pod environment. The extensions register
their own tools, hooks, and context injection. The orchestration layer only resolves paths
and sets environment variables.

---

## 2. Package Map

| Package | Type | Role | Owns |
|---|---|---|---|
| `pi-memory` | pi extension (npm) | Storage, retrieval, injection, tools | MEMORY.md, daily logs, scratchpad, qmd integration |
| `pi-extension-observational-memory` | pi extension (npm) | Compaction strategy, observer/reflector | Observation summaries, auto-GC, priority tagging |
| `@openzosma/memory` | workspace package | Bootstrap + config | Environment variables, extension path resolution |
| `@openzosma/agents` | workspace package | Agent session lifecycle | Wires memory extensions into pi session |

### Dependency chain

```
@openzosma/agents
  └── @openzosma/memory
        ├── pi-memory
        │     ├── @mariozechner/pi-ai
        │     └── @mariozechner/pi-coding-agent
        └── pi-extension-observational-memory
              ├── @mariozechner/pi-ai
              └── @mariozechner/pi-coding-agent
```

---

## 3. Memory Classification

The system implements four categories of memory, each managed by different components:

### Long-term memory (MEMORY.md)

**Owner:** pi-memory
**File:** `.pi/agent/memory/MEMORY.md`
**Lifecycle:** Persists across sessions via PV. Never automatically pruned.
**Purpose:** Durable facts, decisions, preferences, and constraints.

```markdown
<!-- 2026-03-23 14:30:00 [a1b2c3d4] -->
#decision [[database-choice]] Chose PostgreSQL for all backend services. No ORM.

<!-- 2026-03-23 15:00:00 [a1b2c3d4] -->
#preference [[editor]] User prefers Neovim with LazyVim config.
```

Written explicitly by the agent via the `memory_write` tool when it identifies something
worth remembering. Uses `#tags` and `[[wikilinks]]` for retrieval.

### Episodic memory (daily logs)

**Owner:** pi-memory
**File:** `.pi/agent/memory/daily/YYYY-MM-DD.md`
**Lifecycle:** One file per calendar day. Persists across sessions. Never pruned.
**Purpose:** Running narrative of what happened during work. Captures context flow.

Written to in three ways:
1. Agent calls `memory_write` with `target: "daily"` during execution
2. **Session handoff** — pi-memory auto-captures open scratchpad items + recent daily log
   context to the daily file before each compaction (`session_before_compact` hook)
3. **Exit summary** — pi-memory generates an LLM summary of the session and appends it
   to the daily file on `session_shutdown`

Today's and yesterday's daily logs are loaded into context at every turn.

### Working memory (scratchpad)

**Owner:** pi-memory
**File:** `.pi/agent/memory/SCRATCHPAD.md`
**Lifecycle:** Persists across sessions. Items are manually checked off or cleared.
**Purpose:** Short-term task tracking. "Fix this later" items.

```markdown
- [ ] Fix the type error in gateway auth middleware
- [x] Add session creation endpoint
- [ ] Write tests for memory bootstrap
```

Managed via the `scratchpad` tool (add, done, undo, clear actions).
Open items are injected into context every turn and captured during compaction handoffs.

### Observational memory (compaction summaries)

**Owner:** pi-extension-observational-memory
**Storage:** In-memory session entries (not written to filesystem)
**Lifecycle:** Lives only within the current session's context window.
**Purpose:** Compressed representation of conversation history for long sessions.

```markdown
## Observations
Date: 2026-03-23
- 🔴 User requires PostgreSQL — no ORM, raw SQL only
- 🟡 Working on gateway session endpoint, Hono framework
- 🟢 Prefers concise commit messages

## Open Threads
- Session creation endpoint needs auth middleware

## Next Action Bias
1. Implement auth middleware for gateway routes
```

Created by the observational-memory extension when it replaces pi's default compaction.
Priority-tagged (🔴 critical, 🟡 important, 🟢 informational) with a reflector pass
that deduplicates and prunes when observations grow too large.

### Summary: memory classification matrix

| Type | Files | Written by | Injected into context | Survives session end | Survives pod restart |
|---|---|---|---|---|---|
| Long-term | MEMORY.md | Agent via `memory_write` | Yes (every turn) | Yes | Yes (PV) |
| Episodic | daily/YYYY-MM-DD.md | Agent + auto-handoff + exit summary | Today + yesterday | Yes | Yes (PV) |
| Working | SCRATCHPAD.md | Agent via `scratchpad` | Yes (open items) | Yes | Yes (PV) |
| Observational | Session entries | Observational-memory extension | Yes (as compaction) | No | No |

---

## 4. Filesystem Layout

All memory files live under a single root directory, defaulting to
`<workspaceDir>/.pi/agent/memory`:

```
/home/agent/                          # Pod workspace root (PV mount)
  └── .pi/
      └── agent/
          └── memory/                 # PI_MEMORY_DIR
              ├── MEMORY.md           # Long-term curated memory
              ├── SCRATCHPAD.md       # Working checklist
              └── daily/
                  ├── 2026-03-21.md   # Episodic log (2 days ago)
                  ├── 2026-03-22.md   # Episodic log (yesterday)
                  └── 2026-03-23.md   # Episodic log (today)
```

Directories are created lazily by pi-memory on `session_start` via `fs.mkdirSync` with
`{ recursive: true }`.

The path is controlled by the `PI_MEMORY_DIR` environment variable, which `@openzosma/memory`
sets during bootstrap.

---

## 5. Bootstrap Sequence

When a user sends their first message, `PiAgentSession` in `@openzosma/agents` creates
a pi-coding-agent session. Memory bootstraps as part of that process:

```
PiAgentSession constructor
│
├── 1. bootstrapMemory({ workspaceDir })          (@openzosma/memory)
│      ├── Sets process.env.PI_MEMORY_DIR
│      ├── Sets process.env.PI_MEMORY_QMD_UPDATE   (if configured)
│      ├── Sets process.env.PI_MEMORY_NO_SEARCH    (if configured)
│      ├── Resolves pi-memory/index.ts path        (via createRequire)
│      ├── Resolves pi-extension-observational-memory/index.ts path
│      └── Returns { paths: [piMemPath, obsMemPath], memoryDir }
│
├── 2. bootstrapPiExtensions()                     (@openzosma/agents)
│      └── Returns existing extension paths (web-access, subagents, guardrails)
│
├── 3. new DefaultResourceLoader({                 (pi-coding-agent)
│        additionalExtensionPaths: [
│          ...extensionPaths,      # web-access, subagents, guardrails
│          ...memoryResult.paths,  # pi-memory, observational-memory
│        ]
│      })
│
├── 4. resourceLoader.reload()
│      └── jiti loads each extension .ts file at runtime
│          ├── pi-memory default export called with (pi: ExtensionAPI)
│          │     ├── Registers session_start hook
│          │     ├── Registers session_shutdown hook
│          │     ├── Registers before_agent_start hook
│          │     ├── Registers session_before_compact hook
│          │     ├── Registers input hook
│          │     ├── Registers tools: memory_write, memory_read, scratchpad, memory_search
│          │     └── pi-memory reads PI_MEMORY_DIR from env
│          │
│          └── observational-memory default export called with (pi: ExtensionAPI)
│                ├── Registers session_start hook (reads flags)
│                ├── Registers agent_end hook (auto-compaction trigger)
│                ├── Registers session_before_compact hook (observer)
│                ├── Registers session_before_tree hook (branch summarizer)
│                ├── Registers session_compact hook (cleanup)
│                ├── Registers commands: obs-memory-status, obs-reflect, etc.
│                └── Registers shortcut: ctrl+shift+o (status overlay)
│
└── 5. createAgentSession({ ... })                 (pi-coding-agent)
       └── Session created, hooks are now active
```

**Registration order matters.** pi-memory is listed before observational-memory in the
paths array. The pi extension system runs hooks in registration order. This means
pi-memory's `session_before_compact` hook (which writes the handoff entry to the daily log)
runs before observational-memory's hook (which replaces the compaction summary).

---

## 6. Pi Extension: pi-memory

**Package:** `pi-memory@0.3.6`
**Entry:** `index.ts` (single-file extension, ~1400 lines)
**Source:** npm published package

### What it does

pi-memory is the **storage and retrieval layer**. It owns all filesystem operations,
provides tools for the agent to read/write memory, injects memory context into every turn,
and manages the qmd search integration.

### Hooks registered

| Hook | When it fires | What pi-memory does |
|---|---|---|
| `session_start` | Session created | Creates memory directories. Detects qmd. Auto-creates qmd collection. Starts background qmd update timer. |
| `before_agent_start` | Before every agent turn | Builds memory context (MEMORY.md + scratchpad + daily logs + search results). Appends to system prompt. |
| `session_before_compact` | Before context compaction | Writes session handoff (open scratchpad items + recent daily log tail) to today's daily file. |
| `session_shutdown` | Session ending | Generates LLM exit summary of the session. Appends to today's daily file. Runs final qmd update. Cleans up timers. |
| `input` | User types input | Detects `/quit` to set exit summary reason. |

### Tools registered

| Tool | Purpose | Parameters |
|---|---|---|
| `memory_write` | Write to MEMORY.md or daily log | `target` (memory/daily), `content`, optional `tags` |
| `memory_read` | Read a memory file or list daily logs | `target` (memory/scratchpad/daily/list) |
| `scratchpad` | Manage checklist | `action` (add/done/undo/clear), `text` |
| `memory_search` | Search across all memory files via qmd | `query`, `mode` (keyword/semantic/deep) |

### Context injection (before_agent_start)

Every agent turn, pi-memory appends a `## Memory` section to the system prompt containing:

1. **Scratchpad** — open (unchecked) items from SCRATCHPAD.md
2. **Today's daily log** — full content of `daily/YYYY-MM-DD.md` for today
3. **Search results** — qmd semantic/keyword search against the user's prompt (if qmd available and `PI_MEMORY_NO_SEARCH` not set)
4. **MEMORY.md** — full curated long-term memory content
5. **Yesterday's daily log** — full content of yesterday's file

Priority order: scratchpad > today > search > MEMORY.md > yesterday. If total content
exceeds token limits, lower-priority items are truncated.

The injection also includes usage instructions telling the agent how to use each tool
and when to write memories.

### Exit summary (session_shutdown)

When a session ends, pi-memory asks the active LLM model to generate a summary of the
conversation. The summary is formatted and appended to today's daily log:

```markdown
<!-- EXIT 14:30:00 [a1b2c3d4] reason=session-end -->
## Exit Summary

Built the memory integration for OpenZosma. Created @openzosma/memory package
as orchestration layer. Wired pi-memory and observational-memory extensions
into the agent session. All tests passing.
```

If the model call fails, a fallback text-only summary is generated from available context.

### Session handoff (session_before_compact)

Before every compaction, pi-memory captures a snapshot to the daily log:

```markdown
<!-- HANDOFF 14:15:00 [a1b2c3d4] -->
## Session Handoff

**Open scratchpad items:**
- [ ] Fix the type error in gateway auth middleware
- [ ] Write tests for memory bootstrap

**Recent daily log context:**
(last 15 lines of today's daily log)
```

This ensures that even if observational-memory's compaction loses some detail, the raw
facts are preserved on disk in the daily log.

---

## 7. Pi Extension: pi-extension-observational-memory

**Package:** `pi-extension-observational-memory@0.1.3`
**Entry:** `index.ts` + `overlay.ts` (TUI status overlay)
**Source:** npm published package

### What it does

This extension **replaces pi's default compaction** with an observational memory strategy.
Instead of generic summarization, it produces structured observation logs with priority
tagging and runs a reflector garbage collector when observations grow large.

### How it relates to pi-memory

These two extensions serve **different purposes** and do **not conflict**:

- **pi-memory** writes the handoff entry to disk, then returns from `session_before_compact`
  without a compaction result (returns `undefined`).
- **observational-memory** generates the actual compaction summary and returns a
  `CompactionResult` object that replaces pi's default compaction.

The pi extension system calls all registered hooks in order. pi-memory runs first (writes
handoff to disk, returns `undefined`), then observational-memory runs (generates summary,
returns `{ compaction }`).

### Observer/Reflector two-threshold model

The system uses two thresholds to manage memory pressure:

```
Raw conversation tokens (growing)
   │
   │  ... agent turns accumulate ...
   │
   ├── Observer threshold (default 30k tokens + 8k retain buffer = 38k activation)
   │     └── Triggers auto-compaction
   │           └── Conversation serialized → LLM → observational summary
   │                 └── Priority-tagged bullets (🔴/🟡/🟢)
   │
   │  ... more turns, observations accumulate ...
   │
   └── Reflector threshold (default 40k observation-block tokens)
         └── Triggers reflector GC on next compaction
               ├── Deduplicate observations by normalized key
               ├── Priority-aware pruning (🔴: max 96, 🟡: max 40, 🟢: max 16)
               └── Preserve highest-priority, most-recent observations
```

### Observer modes

| Mode | Behavior |
|---|---|
| `buffered` (default) | Auto-compaction triggers in background on `agent_end`. Non-blocking. |
| `blocking` | Auto-compaction disabled. Only manual or regular compaction runs. |

### Observation summary format

Every compaction produces a summary in this exact structure:

```markdown
## Observations
Date: 2026-03-23
- 🔴 critical constraint or blocker
- 🟡 important evolving context
- 🟢 low-priority informational note

## Open Threads
- unfinished work item
- (none)

## Next Action Bias
1. most likely immediate next action
2. optional second action

<read-files>
packages/gateway/src/routes/sessions.ts
</read-files>

<modified-files>
packages/gateway/src/routes/sessions.ts
packages/auth/src/middleware.ts
</modified-files>
```

File operation tags (`<read-files>`, `<modified-files>`) are accumulated across compactions.
They track which files the agent has read and modified throughout the session.

### Hooks registered

| Hook | What it does |
|---|---|
| `session_start` | Reads config flags (thresholds, mode, retain buffer) |
| `agent_end` | In buffered mode, checks raw-tail token estimate and triggers auto-compaction if over threshold |
| `session_before_compact` | Serializes conversation, calls LLM with observation prompt, normalizes output, runs reflector if needed |
| `session_before_tree` | Generates observational summaries for abandoned branches |
| `session_compact` | Resets force-reflect flag and auto-compact-in-flight state |

### Commands registered

| Command | Purpose |
|---|---|
| `/obs-memory-status` | Show current observer/reflector status, thresholds, last compaction details |
| `/obs-auto-compact` | Show or set observer/reflector thresholds, mode, and retention |
| `/obs-mode` | Show or set observer mode (buffered/blocking) |
| `/obs-view` | Show latest observation summary |
| `/obs-reflect` | Force aggressive reflection on next compaction and trigger it immediately |

### Shortcut

`Ctrl+Shift+O` — opens the observation memory status overlay (TUI).

---

## 8. Orchestration Package: @openzosma/memory

**Package:** `@openzosma/memory` (workspace: `packages/memory/`)
**Files:** `bootstrap.ts`, `config.ts`, `types.ts`, `index.ts`

### What it does

This is a thin orchestration layer. It does **not** implement any memory logic. It:

1. Sets environment variables that pi-memory reads (`PI_MEMORY_DIR`, `PI_MEMORY_QMD_UPDATE`,
   `PI_MEMORY_NO_SEARCH`)
2. Resolves the filesystem paths to both extension entry points (`pi-memory/index.ts`,
   `pi-extension-observational-memory/index.ts`) using `createRequire`
3. Returns those paths for the agent session to pass to `DefaultResourceLoader`
4. Logs warnings if either extension package is missing

### API

```typescript
import { bootstrapMemory } from "@openzosma/memory"

const result = bootstrapMemory({
  workspaceDir: "/home/agent",
  memoryDir: "/home/agent/.pi/agent/memory",  // optional override
  qmdUpdateMode: "background",                 // optional: background | manual | off
  disableSearch: false,                         // optional: disable qmd search injection
})

// result.paths = ["/path/to/pi-memory/index.ts", "/path/to/obs-memory/index.ts"]
// result.memoryDir = "/home/agent/.pi/agent/memory"
```

### Why it exists

Without this package, `@openzosma/agents` would need to know how to resolve npm package
paths, which env vars to set, and in what order to list extensions. The orchestration
package encapsulates this configuration so the agent code stays clean.

---

## 9. Agent Integration: @openzosma/agents

**Package:** `@openzosma/agents` (workspace: `packages/agents/`)
**File:** `src/pi.agent.ts`

### How memory is wired in

The `PiAgentSession` constructor calls `bootstrapMemory` and merges the returned extension
paths with the other pi extensions:

```typescript
constructor(opts: AgentSessionOpts) {
  const memoryResult = bootstrapMemory({ workspaceDir: opts.workspaceDir })
  const { extensionPaths } = bootstrapPiExtensions()

  const resourceLoader = new DefaultResourceLoader({
    cwd: opts.workspaceDir,
    additionalExtensionPaths: [
      ...extensionPaths,          // web-access, subagents, guardrails
      ...memoryResult.paths,      // pi-memory, observational-memory
    ],
    systemPrompt: opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
  })

  // createAgentSession loads extensions via jiti
}
```

### What the agent code does NOT do

- **No manual tool registration.** Both extensions register their own tools.
- **No manual context injection.** pi-memory's `before_agent_start` hook handles it.
- **No manual compaction logic.** observational-memory's `session_before_compact` handles it.
- **No memory-specific imports** beyond `bootstrapMemory`.

The agent treats memory as a black box that self-configures through the extension system.

### Full extension loading order

1. `pi-web-access` — web search tools
2. `pi-subagents` — sub-agent spawning (if pi CLI available)
3. `pi-subagents/notify.ts` — sub-agent notifications
4. `@aliou/pi-guardrails` — input/output guardrails
5. `pi-memory` — memory storage, retrieval, tools, injection
6. `pi-extension-observational-memory` — compaction, observer, reflector

Position 5 and 6 are critical: pi-memory must come before observational-memory so
its `session_before_compact` handoff writes to disk before observational-memory
replaces the compaction summary.

---

## 10. K3s Pod Lifecycle and Persistence

### Pod architecture

Each agent session runs inside an isolated OpenShell sandbox, which is a K3s pod
created from the `openzosma/agent-sandbox` Docker image. The orchestrator manages
pod creation, message routing, and pod destruction.

```
Orchestrator
    │
    │  gRPC bidirectional streaming
    │
    ▼
K3s Pod (OpenShell sandbox)
├── /home/agent/            ← PersistentVolume mount
│   └── .pi/agent/memory/   ← memory files live here
├── /workspace/             ← agent working directory
├── /tmp/agent/             ← scratch space
└── pi-coding-agent process
    ├── pi-memory extension (loaded)
    └── observational-memory extension (loaded)
```

### PersistentVolume (PV) for memory

Memory files must survive pod restarts. The `/home/agent/` directory is backed by a
Kubernetes PersistentVolume (PV) mounted into each pod:

```yaml
# Conceptual PV spec (not yet implemented)
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: agent-memory-pvc
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
```

**Current state:** The K8s manifests in `infra/k8s/` are placeholders. The PV setup
is planned for Phase 4 (orchestrator + sandbox integration). For now, the sandbox
Dockerfile creates `/workspace` but does not configure persistent storage.

### Session-to-pod mapping

| Session state | Pod state | Memory state |
|---|---|---|
| `created` | Pod being allocated from pool | Memory dir does not exist yet |
| `active` | Pod running, gRPC connected | Memory dir created on first `session_start` |
| `paused` | Pod preserved but idle | Memory files intact on PV |
| `active` (resumed) | Pod re-activated | pi-memory reads existing files, continues |
| `ended` | Pod destroyed | Memory files persist on PV |
| `failed` | Pod destroyed | Memory files persist on PV |

When a new session is created for the same user, the orchestrator can mount the same
PV, giving the new pod access to all previous memory files. This is how long-term
memory and daily logs survive across sessions.

### Pod filesystem policy

The OpenShell sandbox policy controls what the agent process can access:

```yaml
filesystem:
  allow_read: ["/workspace", "/tmp", "/home/agent"]
  allow_write: ["/workspace", "/tmp", "/home/agent"]
  deny: ["/etc/passwd", "/proc", "/sys"]
```

The `.pi/agent/memory/` directory falls within `/home/agent/` and is both readable
and writable by the agent process.

---

## 11. Context Window Flow

This diagram shows how memory content enters the LLM context window during a single
agent turn:

```
                    Context Window
                    ┌─────────────────────────────────┐
                    │                                  │
                    │  System prompt (base)             │
                    │                                  │
                    │  ## Memory                        │  ← injected by pi-memory
                    │  ┌────────────────────────────┐  │    (before_agent_start)
                    │  │ Scratchpad (open items)     │  │
                    │  │ Today's daily log           │  │
                    │  │ Search results (qmd)        │  │
                    │  │ MEMORY.md content           │  │
                    │  │ Yesterday's daily log       │  │
                    │  └────────────────────────────┘  │
                    │                                  │
                    │  Compaction summary (if any)      │  ← generated by
                    │  ┌────────────────────────────┐  │    observational-memory
                    │  │ ## Observations              │  │
                    │  │ - 🔴 critical items          │  │
                    │  │ - 🟡 important context       │  │
                    │  │ - 🟢 informational           │  │
                    │  │ ## Open Threads              │  │
                    │  │ ## Next Action Bias          │  │
                    │  │ <read-files> / <modified>    │  │
                    │  └────────────────────────────┘  │
                    │                                  │
                    │  Recent conversation turns        │  ← raw messages after
                    │  (kept after compaction)          │    last compaction
                    │                                  │
                    │  User's current message           │
                    │                                  │
                    └─────────────────────────────────┘
```

### Token budget breakdown

| Section | Source | Typical size |
|---|---|---|
| Base system prompt | `@openzosma/agents` config | ~2k tokens |
| Memory injection | pi-memory `before_agent_start` | 1k-10k tokens |
| Compaction summary | observational-memory | 2k-8k tokens |
| Raw conversation tail | Kept after last compaction | up to ~30k tokens |
| User message | Current turn | Variable |

The observer auto-compaction triggers at ~38k raw-tail tokens (30k threshold + 8k retain
buffer), which keeps the context window from overflowing on most models.

---

## 12. Tools Available to the Agent

The agent has four memory tools, all registered by pi-memory:

### memory_write

Write durable information to memory files.

```
Targets:
  - memory: append to MEMORY.md (facts, decisions, preferences)
  - daily: append to today's daily log (running context, notes)

Content format:
  - Use #tags for categorization: #decision, #preference, #constraint
  - Use [[wikilinks]] for cross-references: [[auth-strategy]]
  - Each entry gets a timestamp and session ID comment
```

### memory_read

Read memory file contents.

```
Targets:
  - memory: read MEMORY.md
  - scratchpad: read SCRATCHPAD.md
  - daily: read a specific daily log (by date)
  - list: list available daily log files
```

### scratchpad

Manage the working checklist.

```
Actions:
  - add <text>: add a new unchecked item
  - done <text>: mark an item as done
  - undo <text>: uncheck a completed item
  - clear: remove all completed items
```

### memory_search

Search across all memory files using qmd.

```
Modes:
  - keyword: fast text search
  - semantic: embedding-based similarity search
  - deep: combined keyword + semantic with re-ranking

Searches: MEMORY.md, SCRATCHPAD.md, all daily logs
Requires: qmd installed and pi-memory collection configured
```

---

## 13. Search and Retrieval (qmd)

[qmd](https://github.com/tobi/qmd) is an external CLI tool that provides semantic search
over markdown files. It is **optional** — core memory tools work without it.

### What qmd provides

- Keyword search (fast, text-matching)
- Semantic search (embedding-based similarity using local models)
- Hybrid/deep search (combined keyword + semantic with re-ranking)
- Collection-based indexing of the memory directory

### Auto-setup

On `session_start`, pi-memory:
1. Detects if qmd is installed (runs `qmd status`)
2. If available, checks if the `pi-memory` collection exists
3. If not, creates it: `qmd collection add <MEMORY_DIR> --name pi-memory`
4. Adds path contexts: `/daily` with description "Daily append-only work logs"
5. Starts a background timer for periodic `qmd update` calls
6. Runs `qmd embed` to build/update embeddings

### Selective injection

Before each agent turn (`before_agent_start`), pi-memory runs:

```
qmd search "<user prompt>" -c pi-memory --mode hybrid --limit 5 --json
```

The results are included in the memory context section of the system prompt.
This is disabled if `PI_MEMORY_NO_SEARCH=1` is set.

### Pod image requirement

For qmd to work in the sandbox, it must be pre-installed in the Docker image:

```dockerfile
RUN bun install -g https://github.com/tobi/qmd
```

Without qmd, the system operates in degraded mode: `memory_search` tool returns an
install instructions message, and selective injection is skipped. All other memory
functionality works normally.

---

## 14. Compaction and Observation

### What is compaction?

When the conversation context grows too large for the model's context window, pi triggers
compaction. This replaces older conversation history with a summary, freeing up context
space for new turns.

### Default pi compaction vs. observational memory

| Aspect | Default pi compaction | Observational memory |
|---|---|---|
| Summary format | Generic text summary | Structured observations with priority emoji |
| Priority awareness | No | Yes (🔴/🟡/🟢) |
| Reflector GC | No | Yes (deduplication + pruning at threshold) |
| Auto-trigger | Only when context overflows | Proactive at configurable token threshold |
| File tracking | No | Yes (`<read-files>`, `<modified-files>` tags) |
| Open threads | No | Yes (explicit section) |
| Next action bias | No | Yes (explicit section) |

### Two-pass compaction flow

```
1. pi detects context pressure (or observer auto-trigger fires)
2. pi calls session_before_compact hooks in registration order:
   a. pi-memory hook runs first:
      - Writes handoff entry to daily log (scratchpad items + recent context)
      - Returns undefined (does not replace compaction)
   b. observational-memory hook runs second:
      - Serializes conversation via convertToLlm + serializeConversation
      - Includes previous observation summary if exists
      - Calls LLM with observation prompt
      - Normalizes output to required three-section format
      - Checks if reflector should run (observation tokens > reflector threshold)
      - If reflector needed: deduplicates, prunes by priority caps
      - Appends file operation tags
      - Returns { compaction: CompactionResult }
3. pi uses the CompactionResult from observational-memory
4. Old conversation entries replaced with compaction summary
```

### Reflector garbage collection

When the observation block exceeds the reflector threshold (default 40k tokens),
the reflector runs:

1. **Parse** all observation lines from the summary
2. **Normalize** each observation to a key (lowercase, strip formatting)
3. **Deduplicate** by key, keeping higher priority and more recent entries
4. **Cap** by priority level:
   - Threshold mode: 🔴 max 96, 🟡 max 40, 🟢 max 16
   - Forced mode (`/obs-reflect`): 🔴 max 72, 🟡 max 28, 🟢 max 8
5. **Deduplicate** open threads and next action items
6. **Reassemble** the summary in the standard three-section format

---

## 15. Configuration Reference

### Environment variables (set by @openzosma/memory)

| Variable | Default | Description |
|---|---|---|
| `PI_MEMORY_DIR` | `<workspaceDir>/.pi/agent/memory` | Root directory for all memory files |
| `PI_MEMORY_QMD_UPDATE` | `background` | qmd re-indexing mode: `background`, `manual`, `off` |
| `PI_MEMORY_NO_SEARCH` | unset | Set to `1` to disable selective memory injection |

### Observational memory flags (set via pi extension system)

| Flag | Default | Description |
|---|---|---|
| `obs-auto-compact` | `true` | Enable observer auto-trigger |
| `obs-mode` | `buffered` | `buffered` (background on agent_end) or `blocking` |
| `obs-observer-threshold` | `30000` | Raw-tail tokens before observer fires |
| `obs-reflector-threshold` | `40000` | Observation-block tokens before reflector GC |
| `obs-retain-raw-tail` | `8000` | Extra raw-tail tokens kept before observer fires |

These can be set as CLI flags when starting pi, or changed at runtime via
`/obs-auto-compact` command.

### MemoryConfig interface

```typescript
interface MemoryConfig {
  workspaceDir: string         // Pod workspace root (e.g., /home/agent)
  memoryDir?: string           // Override PI_MEMORY_DIR
  qmdUpdateMode?: "background" | "manual" | "off"
  disableSearch?: boolean      // Disable qmd search injection
}
```

---

## 16. Failure Modes and Degraded Operation

| Failure | Impact | Behavior |
|---|---|---|
| pi-memory not installed | No memory tools, no context injection | Warning logged, agent works without memory |
| observational-memory not installed | Default pi compaction used | Warning logged, compaction still works |
| Both missing | No memory at all | Warning logged, agent operates statelessly |
| qmd not installed | No `memory_search`, no selective injection | Core tools still work, MEMORY.md/scratchpad/daily logs still injected |
| qmd collection missing | Same as qmd not installed | pi-memory auto-creates collection on session_start |
| LLM API key missing | No exit summary, no observation compaction | Both extensions fall back gracefully, log warnings |
| PV not mounted | Memory lost on pod restart | Files created in ephemeral pod storage, work within session |
| Memory dir not writable | All writes fail | Tools return error messages, agent continues without persistence |
| Observation generation fails | Default compaction used | observational-memory returns undefined, pi uses built-in compaction |

---

## 17. What This System Does Not Do

- **No database storage for memory.** Memory is files on disk, not rows in PostgreSQL.
- **No cross-session real-time sharing.** Each pod reads its own PV. There is no pub/sub
  for memory updates between concurrent sessions.
- **No automatic pruning of long-term memory.** MEMORY.md grows unbounded. Manual curation
  by the agent (or user) is the only mechanism.
- **No embedding generation.** Embeddings are handled by qmd externally, not by this system.
- **No memory deduplication across files.** The same fact could exist in MEMORY.md and a
  daily log. Search results may contain duplicates.
- **No access control on memory.** Any agent with PV access can read/write all memory files.
- **No encryption at rest.** Memory files are plaintext markdown.
- **No memory versioning or rollback.** Files are append-only with no git-like history.

---

## Appendix: Source File Locations

| File | Package | Purpose |
|---|---|---|
| `packages/memory/src/bootstrap.ts` | @openzosma/memory | `bootstrapMemory()` — resolves extensions, sets env |
| `packages/memory/src/config.ts` | @openzosma/memory | `applyMemoryEnv()` — sets PI_MEMORY_DIR etc. |
| `packages/memory/src/types.ts` | @openzosma/memory | `MemoryConfig`, `MemoryBootstrapResult` |
| `packages/memory/src/index.ts` | @openzosma/memory | Public exports |
| `packages/memory/src/bootstrap.test.ts` | @openzosma/memory | 9 tests for bootstrap + config |
| `packages/agents/src/pi.agent.ts` | @openzosma/agents | `PiAgentSession` — wires memory into session |
| `packages/agents/src/pi/extensions/index.ts` | @openzosma/agents | `bootstrapPiExtensions()` — other extensions |
| `node_modules/pi-memory/index.ts` | pi-memory (npm) | Full extension source (~1400 lines) |
| `node_modules/pi-extension-observational-memory/index.ts` | obs-memory (npm) | Full extension source (~1200 lines) |
| `node_modules/pi-extension-observational-memory/overlay.ts` | obs-memory (npm) | TUI status overlay component |
