# zosma-mem Implementation Plan

> Replace `@openzosma/memory` (thin env-var bootstrap) with `zosma-mem` as the unified memory package — salience-driven, attention-aware, eval-instrumented.

---

## Current State

### `packages/zosma-mem` (this package)
- Eval-only: 7 scenarios, adapter interface, CLI runner, metrics (P@K, R@K, MRR, noise, GC effectiveness)
- No engine implementation — only the `MemoryAdapter` contract and test harness
- Published as `zosma-mem`, exports `zosma-mem/evals`

### `packages/memory` (`@openzosma/memory`)
- Thin bootstrap shim: sets `PI_MEMORY_DIR`, `PI_MEMORY_QMD_UPDATE`, `PI_MEMORY_NO_SEARCH` env vars
- Used by `packages/agents/src/pi.agent.ts` via `bootstrapMemory()`
- No intelligence — delegates everything to pi-brain extensions installed at image build time

### Gap
The two reference docs (NEW-MEMORY-INTEGRATION-PAPER.md, NEW-MEMORY-SURFACE-PLAN.md) describe a salience engine, attention-gated retrieval, reinforcement loop, GC, and co-access graph. None of this exists yet. The eval harness exists but has no real engine to test against.

---

## Target State

`packages/zosma-mem` becomes `@openzosma/zosma-mem` — the single memory package that:

1. **Bootstraps** pi-brain memory (absorbs what `@openzosma/memory` does today)
2. **Implements** the salience engine, attention retrieval, reinforcement loop, GC
3. **Evaluates** itself via the existing eval harness with a self-adapter
4. **Exports** a clean public API for `packages/agents` and `packages/gateway`

`packages/memory` is deleted. All imports of `@openzosma/memory` point to `@openzosma/zosma-mem`.

---

## Package Structure (Final)

```
packages/zosma-mem/
  src/
    index.ts                      # Public API re-exports
    types.ts                      # Core types (MemoryEngine, MemoryEntity, MemoryScore, etc.)
    config.ts                     # MemoryConfig + defaults

    bootstrap/
      env.ts                      # applyMemoryEnv() — absorbed from @openzosma/memory
      init.ts                     # bootstrapMemory() — absorbed from @openzosma/memory

    brain-adapter/
      parser.ts                   # Parse commits.md via remark AST
      state.ts                    # Read state.yaml, list branches
      index.ts

    engine/
      salience.ts                 # computeSalience(score): number
      attention.ts                # computeAttentionScore(query, entity): number
      reinforcement.ts            # recordRead, recordIgnoredRead, recordDecisionInfluence
      factory.ts                  # createMemoryEngine() — wires all subsystems
      index.ts

    store/
      entity-store.ts             # Read/write .salience/*.yaml
      co-access.ts                # co-access.json graph read/write
      index.ts

    ingestion/
      event-bus.ts                # Typed EventEmitter for MemoryEvent
      ingest.ts                   # Score → persist or discard
      commit-indexer.ts           # Watch commits.md → extract entities → score → persist
      index.ts

    retrieval/
      retrieve.ts                 # Top-K with attention gating + co-access boost
      index.ts

    gc/
      decay.ts                    # Logarithmic time decay
      prune.ts                    # Archive low-salience entities
      consolidate.ts              # Merge related low-value clusters
      index.ts

    evals/                        # (existing — untouched)
      types.ts
      runner.ts
      metrics.ts
      report.ts
      scenarios/
      cli/
      __tests__/
      utils/
      index.ts

    adapter/
      self-adapter.ts             # MemoryAdapter impl that wraps the real engine for eval

  package.json
  tsconfig.json
  README.md
  USAGE.md
```

---

## Phase Plan

### Phase 0 — Absorb `@openzosma/memory` bootstrap

**Files:** `src/bootstrap/env.ts`, `src/bootstrap/init.ts`

1. Copy `applyMemoryEnv()` and `bootstrapMemory()` from `packages/memory/src/`
2. Convert to arrow functions per project style
3. Re-export from `src/index.ts` as `bootstrapMemory`, `applyMemoryEnv`
4. Update `packages/agents/package.json`: replace `@openzosma/memory` with `@openzosma/zosma-mem`
5. Update `packages/agents/src/pi.agent.ts`: change import path
6. Delete `packages/memory/` entirely
7. Update root `pnpm-workspace.yaml` if needed
8. Run `pnpm install && pnpm run check`

**Tests:** `src/bootstrap/__tests__/env.test.ts` — verify env vars are set correctly

**Agent instructions:** This is a mechanical move. Copy the 4 source files verbatim, convert `function` to arrow syntax, update imports, delete the old package.

---

### Phase 1 — Types + Salience Engine

**Files:** `src/types.ts`, `src/config.ts`, `src/engine/salience.ts`

1. Define core types from the paper:
   - `MemoryScore` — `{ reuseCount, decisionInfluence, ignoredReads, lastAccessed, attentionWeight }`
   - `MemoryEntity` — `{ id, source: { branch, commitRef }, score, tags, content }`
   - `MemoryEvent` (engine-internal, distinct from eval `MemoryEvent`) — `{ id, type, context, attentionWeight?, metadata?, timestamp }`
   - `MemoryConfig` — `{ memoryDir, salienceThreshold?, gcIntervalMs?, summarizer? }`
   - `Summarizer` — `(texts: string[]) => Promise<string>`
   - `AttentionQuery` — `{ taskDescription, activeToolName?, intent? }`
   - `ScoredEntity` — `{ entity, attentionScore }`
   - `GcReport` — `{ decayed, pruned, consolidated }`

2. Implement `computeSalience(score: MemoryScore): number`:
   ```
   S(e) = 2*reuseCount + 5*decisionInfluence - 2*ignoredReads - ln(1 + ageDays)
   ```

3. Implement `meetsThreshold(salience: number, threshold: number): boolean`

**Tests:** `src/engine/__tests__/salience.test.ts`
- Fresh entity → salience = 0 (passes threshold 0, fails threshold 0.4)
- Decision entity → salience = 5 (high)
- Heavily ignored entity → negative salience
- Time decay: 30 days → ~3.4 decay

**Agent instructions:** Pure functions, no I/O. Use the exact formula from the paper. `ageDays = (Date.now() - lastAccessed) / 86_400_000` — but accept a `now` parameter for testability.

---

### Phase 2 — Brain Adapter

**Files:** `src/brain-adapter/parser.ts`, `src/brain-adapter/state.ts`

1. `parseCommits(markdown: string): ParsedCommit[]` — parse `commits.md` using `unified` + `remark-parse` into structured commit objects (heading, body, ref)
2. `readState(memoryDir: string): MemoryState` — parse `state.yaml` via `yaml` package
3. `listBranches(memoryDir: string): string[]` — read `.memory/branches/` directory

**Dependencies to add:** `unified`, `remark-parse`, `yaml`

**Tests:** `src/brain-adapter/__tests__/parser.test.ts` — parse sample commits.md fixtures

**Agent instructions:** Use `unified().use(remarkParse).parse(markdown)` to get an MDAST. Walk heading nodes to extract commit boundaries. Do NOT use regex.

---

### Phase 3 — Entity Store

**Files:** `src/store/entity-store.ts`, `src/store/co-access.ts`

1. `EntityStore` class:
   - `read(entityId: string): MemoryEntity | undefined` — read `.salience/<id>.yaml`
   - `write(entity: MemoryEntity): void` — write `.salience/<id>.yaml`
   - `list(): string[]` — list all entity IDs
   - `archive(entityId: string): void` — move to `.salience/archive/`
   - `ensureDir(): void` — create `.salience/` and `.salience/archive/` if needed

2. `CoAccessGraph` class:
   - `load(memoryDir: string): Record<string, string[]>`
   - `save(memoryDir: string, graph: Record<string, string[]>): void`
   - `recordCoAccess(graph, entityIds: string[]): void` — update bidirectional edges

**Dependencies to add:** `yaml` (already from phase 2)

**Tests:** `src/store/__tests__/entity-store.test.ts` — write/read/list/archive round-trip in temp dir

**Agent instructions:** Use synchronous `fs` for reads (small YAML files). Async for writes. YAML format must match the paper's schema exactly.

---

### Phase 4 — Ingestion + Commit Indexer

**Files:** `src/ingestion/event-bus.ts`, `src/ingestion/ingest.ts`, `src/ingestion/commit-indexer.ts`

1. `EventBus` — typed `EventEmitter` for `MemoryEvent` lifecycle (ingested, discarded, scored)
2. `ingest(event: MemoryEvent, store: EntityStore, config: MemoryConfig): boolean` — compute salience, persist if above threshold, return true/false
3. `CommitIndexer`:
   - Parse commits.md via brain adapter
   - Track processed commit refs (stored in `.salience/.indexed` file)
   - Extract entities from each unprocessed commit
   - Call `ingest()` for each
   - `reindex()` — idempotent full re-index

**Dependencies to add:** `chokidar` (for watch mode — optional, can defer)

**Tests:** `src/ingestion/__tests__/ingest.test.ts` — event above threshold persists, below threshold discards

**Agent instructions:** CommitIndexer.reindex() must be idempotent. Store processed refs as a JSON array in `.salience/.indexed`. The cold-start case (no .indexed file) processes all commits.

---

### Phase 5 — Attention-Gated Retrieval

**Files:** `src/retrieval/retrieve.ts`

1. `retrieve(query: AttentionQuery, store: EntityStore, coAccess: CoAccessGraph, topK: number): ScoredEntity[]`
2. Attention score: `A(q, e) = 3*tagOverlap(q, e) + S(e) + coAccessBoost(e)`
   - `tagOverlap` = count of entity tags appearing in `query.taskDescription` (case-insensitive)
   - `coAccessBoost` = +1 if any co-accessed entity is also in the current result set (two-pass)
3. Sort by attention score descending, return top-K
4. After retrieval, update co-access graph for the returned entity set

**Tests:** `src/retrieval/__tests__/retrieve.test.ts`
- High tag overlap beats high salience with no overlap
- Co-access boost surfaces related entities

**Agent instructions:** Two-pass retrieval: first pass computes base scores (tag overlap + salience), take top 2K candidates. Second pass adds co-access boost among candidates, re-sort, return top-K.

---

### Phase 6 — Reinforcement

**Files:** `src/engine/reinforcement.ts`

1. `recordRead(entityId, store)` → `reuseCount += 1`, update `lastAccessed`
2. `recordIgnoredRead(entityId, store)` → `ignoredReads += 1`
3. `recordDecisionInfluence(entityId, store)` → `decisionInfluence += 1`, update `lastAccessed`

**Tests:** `src/engine/__tests__/reinforcement.test.ts` — counters increment, lastAccessed updates

**Agent instructions:** Each function reads the entity, mutates the score, writes back. Simple read-modify-write. No locking needed (single-process).

---

### Phase 7 — Engine Factory

**Files:** `src/engine/factory.ts`

1. `createMemoryEngine(config: MemoryConfig): MemoryEngine`
   - Instantiate `EntityStore`, `CoAccessGraph`, `CommitIndexer`
   - Wire `ingest`, `retrieve`, `recordRead`, `recordIgnoredRead`, `recordDecisionInfluence`, `reindex`, `gc`, `shutdown`
   - Start GC interval timer
   - Return the `MemoryEngine` interface

**Tests:** `src/engine/__tests__/factory.test.ts` — create engine, ingest event, retrieve it, shutdown

**Agent instructions:** The engine is the composition root. It owns the lifecycle of the GC timer. `shutdown()` clears the timer. All methods delegate to the subsystem modules.

---

### Phase 8 — Garbage Collection

**Files:** `src/gc/decay.ts`, `src/gc/prune.ts`, `src/gc/consolidate.ts`

1. `decay(store: EntityStore, now: number)` — recompute salience for all entities, write updated scores
2. `prune(store: EntityStore, threshold: number)` — archive entities below threshold for N consecutive cycles (track cycle count in `.salience/<id>.yaml` as `belowThresholdCycles`)
3. `consolidate(store, coAccess, summarizer?)` — find clusters of co-accessed entities all below threshold, merge into single summary entity

**Tests:** `src/gc/__tests__/gc.test.ts`
- Decay reduces salience of old entities
- Prune archives after N cycles
- Consolidate merges cluster into one entity

**Agent instructions:** Prune should NOT archive on the first cycle below threshold. Default: archive after 3 consecutive cycles below threshold (configurable). If no summarizer provided, consolidate concatenates content with `\n---\n` separators and truncates to 2000 chars.

---

### Phase 9 — Self-Adapter for Evals

**Files:** `src/adapter/self-adapter.ts`

1. Implement `MemoryAdapter` (from `src/evals/types.ts`) wrapping `createMemoryEngine()`
2. Map between eval types and engine types:
   - `MemoryEvent` (eval) → `MemoryEvent` (engine)
   - `RetrieveQuery` → `AttentionQuery`
   - `RetrievedEntity` ← `ScoredEntity`
   - `UsageSignal` → `recordRead` / `recordIgnoredRead` / `recordDecisionInfluence`
   - `GcResult` ← `GcReport`
3. `setup()` creates engine with `opts.workDir` as memoryDir, injects deterministic clock
4. `teardown()` calls `engine.shutdown()`

**Tests:** Run the existing 7 eval scenarios against the self-adapter:
```bash
pnpm --filter zosma-mem run eval
```

**Agent instructions:** The self-adapter is the bridge that proves the engine works. All 7 scenarios must pass. The deterministic clock must be injected into the salience engine's `now` parameter — do NOT use `Date.now()` in any engine code; always accept a clock/now parameter.

---

### Phase 10 — Integration + Cleanup

1. Update `packages/zosma-mem/package.json`:
   - Rename to `@openzosma/zosma-mem`
   - Add dependencies: `yaml`, `unified`, `remark-parse`, `pino`, `p-limit`, `chokidar`
   - Add bootstrap exports: `"./bootstrap"` export path
   - Keep `"./evals"` export path

2. Update `packages/agents/package.json`:
   - Replace `"@openzosma/memory": "workspace:*"` with `"@openzosma/zosma-mem": "workspace:*"`

3. Update `packages/agents/src/pi.agent.ts`:
   - `import { bootstrapMemory } from "@openzosma/zosma-mem/bootstrap"`

4. Update `packages/gateway/src/session-manager.ts` (if it references `@openzosma/memory`)

5. Delete `packages/memory/`

6. Run:
   ```bash
   pnpm install
   pnpm run check        # zero errors
   pnpm run build         # clean build
   pnpm --filter @openzosma/zosma-mem run test   # all unit tests
   pnpm --filter @openzosma/zosma-mem run eval   # all 7 scenarios pass
   ```

---

## Dependency Map

```
packages/agents
  └── @openzosma/zosma-mem (bootstrap + engine)

packages/gateway
  └── @openzosma/zosma-mem (engine — future: per-session memory)

@openzosma/zosma-mem
  ├── yaml          — .salience/*.yaml, state.yaml
  ├── unified       — markdown AST parsing
  ├── remark-parse  — commits.md parser
  ├── zod           — schema validation (already present)
  ├── pino          — structured logging
  ├── p-limit       — concurrency control
  ├── chokidar      — watch commits.md (optional, deferred)
  └── pi-brain      — peer dep (reads .memory/)
```

---

## Critical Constraints

1. **Never mutate pi-brain files.** All scoring metadata lives in `.salience/` sidecar.
2. **No `Date.now()` in engine code.** All time-sensitive logic accepts a `now` parameter or clock interface for deterministic testing.
3. **No vector DB.** Tag-overlap proxy is the MVP retrieval mechanism. `computeAttentionScore` is a single function — swappable for embeddings later.
4. **No LLM dependency.** `Summarizer` is a callback. If not provided, consolidation uses concatenation.
5. **Arrow functions everywhere.** Per project coding standards.
6. **No `any` types.** Strict TypeScript throughout.
7. **pi-brain as peer dep.** Read `.memory/` files, never import pi-brain internals.
8. **Existing eval scenarios must not break.** The adapter contract (`MemoryAdapter`) is frozen.

---

## Agent Execution Order

For Claude Sonnet 4.6 executing this plan:

```
Phase 0  ──→  Phase 1  ──→  Phase 2  ──→  Phase 3
                                              │
Phase 4  ←────────────────────────────────────┘
   │
Phase 5  ──→  Phase 6  ──→  Phase 7  ──→  Phase 8
                                              │
Phase 9  ←────────────────────────────────────┘
   │
Phase 10
```

**Parallelizable pairs:**
- Phase 1 + Phase 2 (no dependency)
- Phase 5 + Phase 6 (both depend on store, independent of each other)

**Serial gates:**
- Phase 3 must complete before Phase 4 (ingestion needs store)
- Phase 7 must complete before Phase 8 (GC needs engine)
- Phase 9 must complete before Phase 10 (eval validates the engine)

Each phase should end with `pnpm run check` passing. Each phase with tests should end with `pnpm --filter @openzosma/zosma-mem run test` passing.

---

## Success Criteria

1. `packages/memory/` is deleted
2. `@openzosma/zosma-mem` exports `bootstrapMemory`, `createMemoryEngine`, `runEvals`
3. `pnpm run check` — zero errors across the monorepo
4. `pnpm --filter @openzosma/zosma-mem run test` — all unit tests pass
5. `pnpm --filter @openzosma/zosma-mem run eval` — all 7 scenarios pass against the self-adapter
6. No `@openzosma/memory` references remain anywhere in the codebase
