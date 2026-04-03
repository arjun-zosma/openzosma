INSERT INTO public.skills (name, description, type, source, content) VALUES
('coding', 'Read, write, and edit code. Execute commands. Debug issues.', 'builtin', 'file',
$$# Coding Assistant

You are a coding assistant with access to the full workspace. You can:
- Read, write, and edit files
- Execute bash commands in the sandbox
- Debug and fix issues
- Install packages and run builds

Use the bash tool to execute commands. Use file tools to read and write code.
$$),
('database', 'Query PostgreSQL, MySQL, MongoDB, ClickHouse, BigQuery, and SQLite databases.', 'builtin', 'file',
$$# Database Querying

You have access to database query tools in this sandbox. Connection details are available as environment variables (DB_TYPE, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS or DB_CONNECTION_STRING).

Use `db-query` CLI:
```bash
db-query --connection primary_db --query "SELECT * FROM table LIMIT 10"
db-schema --connection primary_db
```

Only read-only queries are permitted (SELECT, WITH...SELECT, EXPLAIN).
$$),
('reports', 'Generate PDF reports, PPTX presentations, and data visualizations.', 'builtin', 'file',
$$# Report Generation

Generate reports using the tools available in the sandbox:
- PDF reports via React-PDF or Puppeteer
- PPTX presentations via pptxgenjs
- Data visualizations via chart.js

Write the report code, execute it, and deliver the output file.
$$),
('agent-slack', 'Automate Slack: send messages, read channels, manage users.', 'builtin', 'file',
$skill_content$# Slack automation with `agent-slack`

`agent-slack` is a CLI binary on `$PATH`. Invoke via the bash tool (e.g. `agent-slack user list`).

## Authentication

Pre-configured. The `SLACK_TOKEN` environment variable is set automatically.
No manual auth setup is needed. You can verify with:

```bash
agent-slack auth test
```

## Command formatting rules

1. Use bare channel names (`general` not `#general`).
2. Use `| jq` for filtering JSON output. Do not use python3.
3. Run each agent-slack command as a separate bash call (no `&&` chains).
4. Only use flags documented here. Do NOT invent flags -- run `agent-slack <command> --help` if unsure.

## CRITICAL: Always use channel IDs for `message send`

**Channel name resolution hangs indefinitely inside the sandbox.** You MUST resolve channel names to IDs first, then use the ID.

### Correct workflow to send a message:

1. Find the channel ID:
```bash
agent-slack channel list
```
2. Send using the channel ID (e.g. `C096HQPQFA4`):
```bash
agent-slack message send "C096HQPQFA4" "Your message text"
```

### WRONG -- these will hang forever:
```bash
agent-slack message send "openzosma" "text"
agent-slack message send "#openzosma" "text"
```

### RIGHT -- use channel ID directly:
```bash
agent-slack message send "C096HQPQFA4" "text"
```

This applies to ALL `message send` commands. Always resolve the channel ID from `channel list` first.

## Quick reference

### Top-level commands

| Command   | Description |
|-----------|-------------|
| `message` | Read/write Slack messages |
| `channel` | List, create, invite to channels |
| `user`    | Workspace user directory |
| `search`  | Search messages and files |
| `canvas`  | Fetch Slack canvases as Markdown |
| `auth`    | Manage authentication |

---

## Messages

### Fetch a single message (with thread summary)

```bash
agent-slack message get "https://workspace.slack.com/archives/C123/p1700000000000000"
agent-slack message get "C0123ABC" --ts "1770165109.628379"
```

Options: `--ts <ts>`, `--thread-ts <ts>`, `--max-body-chars <n>`, `--include-reactions`

### List recent channel messages or a full thread

```bash
agent-slack message list "C0123ABC" --limit 20
agent-slack message list "C0123ABC" --thread-ts "1770165109.000000"
agent-slack message list "https://workspace.slack.com/archives/C123/p1700000000000000"
```

Options: `--thread-ts <ts>`, `--ts <ts>`, `--limit <n>` (default 25), `--oldest <ts>`, `--latest <ts>`, `--with-reaction <emoji>` (repeatable, requires `--oldest`), `--without-reaction <emoji>` (repeatable, requires `--oldest`), `--max-body-chars <n>`, `--include-reactions`

### Send a message (ALWAYS use channel ID, never bare name)

```bash
agent-slack message send "C0123ABC" "Hello from your AI assistant"
agent-slack message send "C0123ABC" "Here is the report" --attach ./report.pdf
agent-slack message send "C0123ABC" "Reply in thread" --thread-ts "1770165109.000000"
agent-slack message send "C0123ABC" --attach ./chart.png --attach ./data.csv
```

Options: `--thread-ts <ts>`, `--attach <path>` (repeatable)

### Edit / delete a message

```bash
agent-slack message edit "https://workspace.slack.com/archives/C123/p1700000000000000" "Updated text"
agent-slack message edit "C0123ABC" "Updated text" --ts "1770165109.628379"
agent-slack message delete "https://workspace.slack.com/archives/C123/p1700000000000000"
agent-slack message delete "C0123ABC" --ts "1770165109.628379"
```

### React to a message

```bash
agent-slack message react add "https://workspace.slack.com/archives/C123/p1700000000000000" "eyes"
agent-slack message react remove "https://workspace.slack.com/archives/C123/p1700000000000000" "eyes"
```

---

## Channels

### List channels

```bash
agent-slack channel list
agent-slack channel list --user "@alice" --limit 50
agent-slack channel list --all --limit 100
```

Options: `--user <user>` (U... or @handle), `--all` (list all conversations, incompatible with `--user`), `--limit <n>` (default 100), `--cursor <cursor>`

### Create a channel

```bash
agent-slack channel new --name "incident-war-room"
agent-slack channel new --name "incident-leads" --private
```

### Invite users to a channel

```bash
agent-slack channel invite --channel "incident-war-room" --users "U01AAAA,@alice,bob@example.com"
```

### Mark as read

```bash
agent-slack channel mark "https://workspace.slack.com/archives/C123/p1700000000000000"
agent-slack channel mark "C0123ABC" --ts "1770165109.628379"
```

---

## Users

### List workspace users

```bash
agent-slack user list
agent-slack user list --limit 100
agent-slack user list --include-bots
```

Options: `--limit <n>` (default 200), `--cursor <cursor>`, `--include-bots`

NOTE: `user list` lists ALL workspace users. There is no `--channel` flag. To find members of a specific channel, use `agent-slack channel list --user "@username"` to check if a user is in a channel, or look at the `num_members` field from `channel list --all`.

### Get a single user

```bash
agent-slack user get "@alice"
agent-slack user get "U01AAAA"
```

### Open a DM / group DM

```bash
agent-slack user dm-open @alice
agent-slack user dm-open @alice @bob
agent-slack user dm-open U01AAAA U02BBBB
```

---

## Search

### Search messages

```bash
agent-slack search messages "query" --channel "C0123ABC"
agent-slack search messages "deploy failed" --user "@alice" --after 2026-01-01
```

### Search files

```bash
agent-slack search files "report" --content-type snippet --limit 10
```

### Search all (messages + files)

```bash
agent-slack search all "smoke tests failed" --channel "C0123ABC" --after 2026-01-01 --before 2026-02-01
```

Shared search options: `--channel <channel>` (repeatable), `--user <user>`, `--after <YYYY-MM-DD>`, `--before <YYYY-MM-DD>`, `--content-type <any|text|image|snippet|file>`, `--limit <n>` (default 20), `--max-content-chars <n>`

---

## Canvas

```bash
agent-slack canvas get "https://workspace.slack.com/docs/T123/F456"
```

---

## Attachments

`message get`, `message list`, and `search` auto-download attachments and include file metadata in JSON output (typically under `files[]`), including `name` and `path` for the local download.
$skill_content$);
