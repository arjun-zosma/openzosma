#!/bin/bash
# ============================================================================
# Pi-Harness Setup Wizard
# ============================================================================
# Interactive configuration for pi-harness.
# Run this after installation to set up API keys, model preferences,
# and server settings.
#
# Usage:
#   bash scripts/setup.sh
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

ENV_FILE="$HOME/.pi-harness/.env"
mkdir -p "$(dirname "$ENV_FILE")"

echo ""
echo -e "${MAGENTA}${BOLD}"
echo "┌─────────────────────────────────────────────────────────┐"
echo "│              ⚡ Pi-Harness Setup Wizard                 │"
echo "└─────────────────────────────────────────────────────────┘"
echo -e "${NC}"
echo ""

# Helper functions
ask() {
	local prompt="$1"
	local default="${2:-}"
	local response

	if [ -n "$default" ]; then
		echo -e "${CYAN}?${NC} ${prompt} ${YELLOW}[$default]${NC} "
	else
		echo -e "${CYAN}?${NC} ${prompt} "
	fi

	read -r response

	if [ -z "$response" ] && [ -n "$default" ]; then
		echo "$default"
	else
		echo "$response"
	fi
}

ask_secret() {
	local prompt="$1"
	local response

	echo -e "${CYAN}?${NC} ${prompt} "
	read -rs response
	echo ""
	echo "$response"
}

ask_yesno() {
	local prompt="$1"
	local default="${2:-y}"
	local response

	if [ "$default" = "y" ]; then
		echo -e "${CYAN}?${NC} ${prompt} ${YELLOW}[Y/n]${NC} "
	else
		echo -e "${CYAN}?${NC} ${prompt} ${YELLOW}[y/N]${NC} "
	fi

	read -r response

	if [ -z "$response" ]; then
		response="$default"
	fi

	case "$response" in
	[Yy] | [Yy][Ee][Ss]) echo "yes" ;;
	*) echo "no" ;;
	esac
}

# ============================================================================
# LLM Provider Configuration
# ============================================================================

echo -e "${BOLD}Step 1: LLM Provider${NC}"
echo ""
echo "Pi-harness supports any OpenAI-compatible API endpoint."
echo "Common options: OpenRouter, OpenCode Go, OpenAI, Anthropic, or local Ollama."
echo ""

PROVIDER=$(ask "Which provider do you want to use?" "openrouter")

case "$PROVIDER" in
openrouter | OpenRouter)
	echo ""
	echo -e "${BLUE}OpenRouter${NC} — Unified API for 200+ models"
	echo "Get your key at: https://openrouter.ai/keys"
	echo ""
	API_KEY=$(ask_secret "Enter your OpenRouter API key")
	MODEL=$(ask "Default model?" "anthropic/claude-sonnet-4")
	echo "OPENROUTER_API_KEY=$API_KEY" >>"$ENV_FILE"
	echo "PI_HARNESS_PROVIDER=openrouter" >>"$ENV_FILE"
	echo "PI_HARNESS_MODEL=$MODEL" >>"$ENV_FILE"
	;;

opencode | OpenCode | opencode-go)
	echo ""
	echo -e "${BLUE}OpenCode Go${NC} — Affordable API with bundled models"
	echo "Get your key at: https://opencode.ai"
	echo ""
	API_KEY=$(ask_secret "Enter your OpenCode API key")
	MODEL=$(ask "Default model?" "qwen3.6-plus")
	echo "OPENZOSMA_LOCAL_MODEL_URL=https://opencode.ai/zen/go/v1" >>"$ENV_FILE"
	echo "OPENZOSMA_LOCAL_MODEL_API_KEY=$API_KEY" >>"$ENV_FILE"
	echo "OPENZOSMA_LOCAL_MODEL_ID=$MODEL" >>"$ENV_FILE"
	echo "PI_HARNESS_PROVIDER=local" >>"$ENV_FILE"
	echo "PI_HARNESS_MODEL=$MODEL" >>"$ENV_FILE"
	;;

openai | OpenAI)
	echo ""
	echo -e "${BLUE}OpenAI${NC} — GPT-4, o3, and more"
	echo "Get your key at: https://platform.openai.com/api-keys"
	echo ""
	API_KEY=$(ask_secret "Enter your OpenAI API key")
	MODEL=$(ask "Default model?" "gpt-4o")
	echo "OPENAI_API_KEY=$API_KEY" >>"$ENV_FILE"
	echo "PI_HARNESS_PROVIDER=openai" >>"$ENV_FILE"
	echo "PI_HARNESS_MODEL=$MODEL" >>"$ENV_FILE"
	;;

anthropic | Anthropic | claude)
	echo ""
	echo -e "${BLUE}Anthropic${NC} — Claude 4 Sonnet, Opus, and more"
	echo "Get your key at: https://console.anthropic.com/settings/keys"
	echo ""
	API_KEY=$(ask_secret "Enter your Anthropic API key")
	MODEL=$(ask "Default model?" "claude-sonnet-4-20250514")
	echo "ANTHROPIC_API_KEY=$API_KEY" >>"$ENV_FILE"
	echo "PI_HARNESS_PROVIDER=anthropic" >>"$ENV_FILE"
	echo "PI_HARNESS_MODEL=$MODEL" >>"$ENV_FILE"
	;;

ollama | Ollama | local)
	echo ""
	echo -e "${BLUE}Ollama${NC} — Run models locally"
	echo "Make sure Ollama is running: https://ollama.com"
	echo ""
	OLLAMA_URL=$(ask "Ollama base URL?" "http://localhost:11434/v1")
	MODEL=$(ask "Default model?" "llama3.2")
	echo "OPENZOSMA_LOCAL_MODEL_URL=$OLLAMA_URL" >>"$ENV_FILE"
	echo "OPENZOSMA_LOCAL_MODEL_ID=$MODEL" >>"$ENV_FILE"
	echo "PI_HARNESS_PROVIDER=local" >>"$ENV_FILE"
	echo "PI_HARNESS_MODEL=$MODEL" >>"$ENV_FILE"
	;;

*)
	echo ""
	echo -e "${BLUE}Custom Provider${NC}"
	echo ""
	BASE_URL=$(ask "Base URL (OpenAI-compatible)?")
	API_KEY=$(ask_secret "Enter your API key")
	MODEL=$(ask "Default model?")
	echo "OPENZOSMA_LOCAL_MODEL_URL=$BASE_URL" >>"$ENV_FILE"
	echo "OPENZOSMA_LOCAL_MODEL_API_KEY=$API_KEY" >>"$ENV_FILE"
	echo "OPENZOSMA_LOCAL_MODEL_ID=$MODEL" >>"$ENV_FILE"
	echo "PI_HARNESS_PROVIDER=local" >>"$ENV_FILE"
	echo "PI_HARNESS_MODEL=$MODEL" >>"$ENV_FILE"
	;;
esac

echo ""
echo -e "${GREEN}✓${NC} Provider configured: $PROVIDER"

# ============================================================================
# Server Configuration
# ============================================================================

echo ""
echo -e "${BOLD}Step 2: Server Configuration${NC}"
echo ""

PORT=$(ask "Port to run on?" "8080")
HOST=$(ask "Host to bind to?" "0.0.0.0")

echo "PI_HARNESS_PORT=$PORT" >>"$ENV_FILE"
echo "PI_HARNESS_HOST=$HOST" >>"$ENV_FILE"

AUTH_ENABLED=$(ask_yesno "Enable API key authentication?" "y")

if [ "$AUTH_ENABLED" = "yes" ]; then
	API_KEY_SECRET=$(ask "API key for clients?" "$(openssl rand -hex 16 2>/dev/null || date +%s | sha256sum | head -c 32)")
	echo "PI_HARNESS_API_KEY=$API_KEY_SECRET" >>"$ENV_FILE"
	echo ""
	echo -e "${GREEN}✓${NC} API key set: ${YELLOW}$API_KEY_SECRET${NC}"
	echo -e "   Save this — you'll need it for clients to connect."
fi

# ============================================================================
# Advanced Options
# ============================================================================

echo ""
if [ "$(ask_yesno "Configure advanced options?" "n")" = "yes" ]; then
	echo ""
	echo -e "${BOLD}Advanced Configuration${NC}"
	echo ""

	MAX_SESSIONS=$(ask "Max concurrent sessions? (0 = unlimited)" "0")
	IDLE_TIMEOUT=$(ask "Idle session timeout in minutes? (0 = none)" "30")
	WORKSPACE=$(ask "Workspace directory?" "$HOME/.pi-harness/workspace")

	echo "PI_HARNESS_MAX_SESSIONS=$MAX_SESSIONS" >>"$ENV_FILE"
	echo "PI_HARNESS_IDLE_TIMEOUT_MINUTES=$IDLE_TIMEOUT" >>"$ENV_FILE"
	echo "PI_HARNESS_WORKSPACE=$WORKSPACE" >>"$ENV_FILE"

	# Tools
	echo ""
	echo "Available tools: read, bash, edit, write, grep, find, ls"
	TOOLS=$(ask "Tools to enable? (blank = all)" "")
	if [ -n "$TOOLS" ]; then
		echo "PI_HARNESS_TOOLS=$TOOLS" >>"$ENV_FILE"
	fi

	# Extensions
	EXT_DIR=$(ask "Extensions directory? (blank = none)" "")
	if [ -n "$EXT_DIR" ]; then
		echo "PI_HARNESS_EXTENSIONS_DIR=$EXT_DIR" >>"$ENV_FILE"
	fi

	# System prompt prefix
	echo ""
	echo "You can set a default system prompt prefix that applies to all sessions."
	echo "Great for company context, coding standards, or persona."
	PREFIX=$(ask "Default system prompt prefix? (blank = none)" "")
	if [ -n "$PREFIX" ]; then
		echo "PI_HARNESS_SYSTEM_PROMPT_PREFIX=$PREFIX" >>"$ENV_FILE"
	fi
fi

# ============================================================================
# Summary
# ============================================================================

echo ""
echo -e "${GREEN}${BOLD}"
echo "┌─────────────────────────────────────────────────────────┐"
echo "│              ✓ Setup Complete!                          │"
echo "└─────────────────────────────────────────────────────────┘"
echo -e "${NC}"
echo ""

echo -e "${CYAN}${BOLD}Configuration saved to:${NC} ${YELLOW}$ENV_FILE${NC}"
echo ""
echo -e "${CYAN}To start the server:${NC}"
echo -e "   ${GREEN}pi-harness${NC}"
echo ""
echo -e "${CYAN}To connect with the TUI:${NC}"
echo -e "   ${GREEN}pi-harness-tui${NC}"
echo ""
echo -e "${CYAN}To run in background (with nohup):${NC}"
echo -e "   ${GREEN}nohup pi-harness > ~/.pi-harness/server.log 2>&1 &${NC}"
echo ""
echo -e "${CYAN}To run as a systemd service:${NC}"
echo -e "   See: ${YELLOW}https://github.com/zosmaai/openzosma/tree/main/packages/pi-harness#systemd${NC}"
echo ""
