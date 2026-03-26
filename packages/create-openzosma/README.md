# create-openzosma

Interactive setup CLI for [OpenZosma](https://github.com/zosmaai/openzosma) -- the self-hosted AI agent platform.

Go from zero to a running instance with a single command.

## Quick start

```bash
# npm
npx create-openzosma

# pnpm
pnpm create openzosma
```

The CLI walks you through the entire setup interactively -- no flags to memorize, no YAML to edit by hand.

## What it does

The setup pipeline runs 12 steps:

| Step | What happens |
|------|-------------|
| **Prerequisites** | Checks for Node.js 22+, pnpm, Docker, Docker Compose, Git. Warns if OpenShell CLI is missing. |
| **Project** | Clones the repo (or detects you're already inside one). |
| **LLM provider** | Pick your provider and enter an API key. |
| **Local model** | Optional. Configure a local/self-hosted model endpoint (Ollama, vLLM, etc.). |
| **Database** | PostgreSQL connection details (defaults to `localhost:5432/openzosma`). |
| **Sandbox** | Choose local mode or orchestrator mode with container isolation. |
| **Auth** | Auto-generates `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY`. Optionally configure Google/GitHub OAuth. |
| **.env** | Writes `.env.local` with all collected values. |
| **Docker** | Starts PostgreSQL and Valkey via `docker compose up -d`. |
| **Install** | Runs `pnpm install`. |
| **Migrations** | Runs database schema and auth migrations. |
| **Build** | Builds all packages with Turborepo. |

At the end, it offers to start the gateway (port 4000) and dashboard (port 3000) for you.

## Supported providers

| Provider | Default model |
|----------|--------------|
| Anthropic | Claude Sonnet 4 |
| OpenAI | GPT-4o |
| Google | Gemini 2.5 Flash |
| Groq | Llama 3.3 70B |
| xAI | Grok 3 |
| Mistral | Mistral Large |
| Local model | Any OpenAI-compatible endpoint |

## Post-clone mode

Contributors who already cloned the repo can run:

```bash
pnpm setup
```

This skips the clone step and configures the existing checkout. The CLI auto-detects whether it's inside an OpenZosma repo.

## Requirements

- **Node.js** >= 22
- **pnpm** (latest)
- **Docker** and **Docker Compose**
- **Git**
- **OpenShell CLI** (optional, needed for orchestrator sandbox mode)

## License

Apache-2.0
