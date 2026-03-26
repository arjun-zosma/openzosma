# @openzosma/logger

Zero-dependency structured logging for OpenZosma backend packages. Writes to `process.stdout` / `process.stderr`, supports level filtering via environment variables, and ships two formatters (human-readable text for development, single-line JSON for production).

## Overview

Every backend package creates a module-level logger with `createLogger()`. The logger:

- Filters messages below the configured minimum severity level.
- Prefixes every line with a timestamp, level label, and component name.
- Accepts an optional `data` object for structured context (key-value pairs).
- Supports child loggers that inherit config and merge additional context.
- Routes `error` and `fatal` to stderr; everything else to stdout.

## Quick Start

```ts
import { createLogger } from "@openzosma/logger"

const log = createLogger({ component: "gateway" })

log.info("Server started", { port: 4000 })
log.warn("Slow query detected", { duration: 1200, table: "agent_configs" })
log.error("Request failed", { status: 500, path: "/api/v1/sessions" })
```

Development output (text formatter):

```
[2026-03-26T10:00:00.000Z] INFO  [gateway] Server started port=4000
[2026-03-26T10:00:01.000Z] WARN  [gateway] Slow query detected duration=1200 table=agent_configs
[2026-03-26T10:00:02.000Z] ERROR [gateway] Request failed status=500 path=/api/v1/sessions
```

Production output (JSON formatter, `NODE_ENV=production`):

```json
{"level":"info","component":"gateway","message":"Server started","port":4000,"timestamp":"2026-03-26T10:00:00.000Z"}
{"level":"warn","component":"gateway","message":"Slow query detected","duration":1200,"table":"agent_configs","timestamp":"2026-03-26T10:00:01.000Z"}
{"level":"error","component":"gateway","message":"Request failed","status":500,"path":"/api/v1/sessions","timestamp":"2026-03-26T10:00:02.000Z"}
```

## Log Levels

Levels are ordered by ascending severity. Messages below the configured minimum are silently discarded.

| Level | Severity | Description |
|-------|----------|-------------|
| `debug` | 0 | Verbose diagnostics. Suppressed in production by default. |
| `info` | 1 | Normal operational messages. |
| `warn` | 2 | Non-fatal issues that may need attention. |
| `error` | 3 | Failures that affect a single operation. |
| `fatal` | 4 | Unrecoverable failures (process should exit). |
| `silent` | 5 | Suppresses all output. |

### Defaults

- **Development** (`NODE_ENV` unset or not `"production"`): minimum level is `debug`, text formatter.
- **Production** (`NODE_ENV=production`): minimum level is `info`, JSON formatter.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Minimum severity level. Set to any valid level name. |
| `NODE_ENV` | _(unset)_ | When `"production"`, selects JSON formatter and defaults min level to `info`. |

## Formatters

### Text Formatter (default in development)

Human-readable, one line per message. Structured data is flattened to `key=value` pairs.

```
[<ISO timestamp>] <LEVEL> [<component>] <message> <key=value ...>
```

### JSON Formatter (default in production)

Machine-parseable, one JSON object per line. The `data` fields are spread at the top level alongside `level`, `component`, `message`, and `timestamp`.

```json
{"level":"info","component":"orchestrator","message":"Sandbox created","sandboxName":"sb-user-abc","timestamp":"..."}
```

### Custom Formatter

Pass a `formatter` object implementing `LogFormatter` to override the default:

```ts
import { createLogger } from "@openzosma/logger"
import type { LogFormatter } from "@openzosma/logger"

const csvFormatter: LogFormatter = {
  format: (entry) => [entry.timestamp, entry.level, entry.component, entry.message].join(","),
}

const log = createLogger({ component: "custom", formatter: csvFormatter })
```

## Child Loggers

Child loggers inherit the parent's config (component, level, formatter) and merge additional context into every log entry:

```ts
const log = createLogger({ component: "gateway" })

const reqLog = log.child({ requestId: "abc-123", userId: "user-42" })
reqLog.info("Processing request")
reqLog.error("Handler failed", { status: 500 })
```

Output:

```
[2026-03-26T10:00:00.000Z] INFO  [gateway] Processing request requestId=abc-123 userId=user-42
[2026-03-26T10:00:01.000Z] ERROR [gateway] Handler failed requestId=abc-123 userId=user-42 status=500
```

Child context is merged with per-call `data`. Per-call keys take precedence if there is a conflict.

## Exported API

### Functions

| Export | Description |
|--------|-------------|
| `createLogger(config)` | Create a logger instance. |
| `shouldLog(messageLevel, minLevel)` | Returns `true` if a message at `messageLevel` should be emitted given `minLevel`. |
| `resolveLogLevel()` | Resolve the effective log level from `LOG_LEVEL` env var with dev/prod defaults. |

### Types

| Export | Description |
|--------|-------------|
| `Logger` | Logger instance with `debug`, `info`, `warn`, `error`, `fatal`, and `child` methods. |
| `LoggerConfig` | Configuration object: `component` (required), `level` (optional), `formatter` (optional). |
| `LogEntry` | A single structured log entry passed to formatters. |
| `LogLevel` | Union type: `"debug" \| "info" \| "warn" \| "error" \| "fatal" \| "silent"`. |
| `LogFormatter` | Interface with a `format(entry: LogEntry): string` method. |

### Constants

| Export | Description |
|--------|-------------|
| `SEVERITY` | `Record<LogLevel, number>` mapping levels to numeric severity. |
| `LEVEL_LABELS` | `Record<LogLevel, string>` mapping levels to uppercase display labels. |

### Formatters

| Export | Description |
|--------|-------------|
| `textFormatter` | Human-readable text formatter (default in development). |
| `jsonFormatter` | Structured JSON formatter (default in production). |

## File Structure

```
packages/logger/
  package.json
  tsconfig.json
  src/
    index.ts                  # Public API (re-exports)
    logger.ts                 # createLogger() factory, child logger support
    levels.ts                 # LogLevel type, SEVERITY map, shouldLog(), resolveLogLevel()
    types.ts                  # LogEntry, LogFormatter, LoggerConfig, Logger interfaces
    formatters/
      text.ts                 # Human-readable text formatter
      json.ts                 # Structured JSON formatter
```
