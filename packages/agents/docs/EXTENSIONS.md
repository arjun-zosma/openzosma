# Agents Extension Setup

This package integrates Pi extensions into `@openzosma/agents` so the runtime can use:

- `pi-subagents` (`subagent`, `subagent_status`)
- `pi-web-access` (`web_search`, `fetch_content`, `get_search_content`)
- `@aliou/pi-guardrails` (file-access policies + dangerous-command permission gate)

## Where Extension Loading Happens

Extension bootstrapping is wired in:

- `src/pi.agent.ts`
- `src/pi/extensions/index.ts`

`PiAgentSession` creates a `DefaultResourceLoader` with `additionalExtensionPaths` and passes it to `createAgentSession(...)`.

## Bootstrap Flow

`bootstrapPiExtensions()` (`src/pi/extensions/index.ts`) does three things:

1. Resolves extension entry files from installed npm packages:
  - `pi-web-access/index.ts`
  - `pi-subagents/index.ts`
  - `pi-subagents/notify.ts`
  - `@aliou/pi-guardrails/src/index.ts`
2. Applies env bridge for subagent depth:
  - `SUBAGENTS_CONFIG.maxDepth` -> `PI_SUBAGENT_MAX_DEPTH`
3. Syncs extension config files under `~/.pi`:
  - `~/.pi/web-search.json`
  - `~/.pi/agent/extensions/subagent/config.json`
  - `~/.pi/agent/extensions/guardrails.json`

## Programmatic Config Source

Extension configs are typed constants in `src/pi/config.ts`. Edit them there to change extension behavior. API keys (secrets) are still read from environment variables at sync time.

### Web Search

- Config: `WEB_SEARCH_CONFIG` (`WebSearchExtensionConfig`) in `src/pi/config.ts`
- File: `src/pi/extensions/web-search.ts`
- Output: `~/.pi/web-search.json`
- Structural fields (`provider`, `searchModel`, `curateWindow`) come from `WEB_SEARCH_CONFIG`.
- `PERPLEXITY_API_KEY` and `GEMINI_API_KEY` are still read from env at sync time.

### Subagents

- Config: `SUBAGENTS_CONFIG` (`SubagentsExtensionConfig`) in `src/pi/config.ts`
- File: `src/pi/extensions/subagents.ts`
- Output: `~/.pi/agent/extensions/subagent/config.json`
- Fields: `asyncByDefault`, `maxDepth` (written to `PI_SUBAGENT_MAX_DEPTH`), `sessionDir`.

### Guardrails

- Config: `GUARDRAILS_CONFIG` (`GuardrailsExtensionConfig`) in `src/pi/config.ts`
- File: `src/pi/extensions/guard-rails.ts`
- Output: `~/.pi/agent/extensions/guardrails.json`
- Fields: `enabled`, `features.policies`, `features.permissionGate`, `permissionGate.requireConfirmation`, `permissionGate.explainCommands`, `permissionGate.explainModel`, `permissionGate.explainTimeout`.

Per-rule policy overrides (adding or modifying file protection rules) must be written directly to `~/.pi/agent/extensions/guardrails.json` or the project-local `.pi/extensions/guardrails.json`.

## Notes on Tools and System Prompt

- Built-in tool selection remains in `src/pi/tools.ts` and respects `toolsEnabled`.
- Extension tools are loaded by the resource loader and become available in the session.
- System prompt comes from `opts.systemPrompt` or falls back to `DEFAULT_SYSTEM_PROMPT`.

## Local Verification

1. Ensure dependencies are installed (already in `packages/agents/package.json`):
  - `pi-subagents`
  - `pi-web-access`
  - `@aliou/pi-guardrails`
2. Start the gateway/agent service.
3. Send a prompt that should trigger delegation/search, for example:
  - "Use subagents to analyze the auth flow and propose a plan."
  - "Research  using web_search and summarize findings."
4. Confirm stream events include tool calls like:
  - `subagent`
  - `subagent_status`
  - `web_search`
  - `fetch_content`
5. To verify guardrails, ask the agent to read a `.env` file — it should be blocked, or attempt a `rm -rf` bash command — it should prompt for confirmation.

## Troubleshooting

- If extension paths fail to resolve, ensure `pnpm install` was run and packages exist in `node_modules`.
- If extension loading errors occur, they are logged from `src/pi.agent.ts` (`extensionsResult.errors`).
- If web search returns limited results, check API key env vars and provider selection env vars.
- If guardrails is not intercepting commands, confirm `~/.pi/agent/extensions/guardrails.json` was written on startup and that `enabled` is not `false`.

