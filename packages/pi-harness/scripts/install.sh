#!/bin/bash
# ============================================================================
# Pi-Harness Installer
# ============================================================================
# One-liner install for the Pi-Harness — a standalone headless agent server
# built on top of pi-coding-agent by Mario Zechner.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/zosmaai/openzosma/main/packages/pi-harness/scripts/install.sh | bash
#
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

# Configuration
REPO_URL="https://github.com/zosmaai/openzosma.git"
INSTALL_DIR="${PI_HARNESS_INSTALL_DIR:-$HOME/.pi-harness}"
NODE_MIN_VERSION=22

# Options
SKIP_SETUP=false
BRANCH="main"

# Parse arguments
while [[ $# -gt 0 ]]; do
	case $1 in
	--skip-setup)
		SKIP_SETUP=true
		shift
		;;
	--branch)
		BRANCH="$2"
		shift 2
		;;
	--dir)
		INSTALL_DIR="$2"
		shift 2
		;;
	-h | --help)
		echo "Pi-Harness Installer"
		echo ""
		echo "Usage: install.sh [OPTIONS]"
		echo ""
		echo "Options:"
		echo "  --skip-setup   Skip interactive setup wizard"
		echo "  --branch NAME  Git branch to install (default: main)"
		echo "  --dir PATH     Installation directory (default: ~/.pi-harness)"
		echo "  -h, --help     Show this help"
		exit 0
		;;
	*)
		echo "Unknown option: $1"
		exit 1
		;;
	esac
done

# ============================================================================
# Helper functions
# ============================================================================

print_banner() {
	echo ""
	echo -e "${MAGENTA}${BOLD}"
	echo "┌─────────────────────────────────────────────────────────┐"
	echo "│              ⚡ Pi-Harness Installer                    │"
	echo "├─────────────────────────────────────────────────────────┤"
	echo "│  Standalone headless agent harness for pi-coding-agent  │"
	echo "│  Built with gratitude for Mario Zechner's pi-mono       │"
	echo "└─────────────────────────────────────────────────────────┘"
	echo -e "${NC}"
}

log_info() {
	echo -e "${CYAN}→${NC} $1"
}

log_success() {
	echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
	echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
	echo -e "${RED}✗${NC} $1"
}

# ============================================================================
# System detection
# ============================================================================

detect_os() {
	case "$(uname -s)" in
	Linux*)
		OS="linux"
		;;
	Darwin*)
		OS="macos"
		;;
	*)
		OS="unknown"
		log_warn "Unknown operating system"
		;;
	esac
	log_success "Detected: $OS"
}

# ============================================================================
# Dependency checks
# ============================================================================

check_node() {
	log_info "Checking Node.js..."

	if command -v node &>/dev/null; then
		NODE_VERSION=$(node --version | sed 's/v//')
		NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
		if [ "$NODE_MAJOR" -ge "$NODE_MIN_VERSION" ]; then
			log_success "Node.js v$NODE_VERSION found"
			return 0
		else
			log_warn "Node.js v$NODE_VERSION found, but v$NODE_MIN_VERSION+ required"
		fi
	fi

	log_error "Node.js $NODE_MIN_VERSION+ is required but not found"
	log_info "Install Node.js $NODE_MIN_VERSION LTS:"
	log_info "  macOS:    brew install node@$NODE_MIN_VERSION"
	log_info "  Ubuntu:   curl -fsSL https://deb.nodesource.com/setup_${NODE_MIN_VERSION}.x | sudo -E bash - && sudo apt install -y nodejs"
	log_info "  Or visit: https://nodejs.org/en/download/"
	exit 1
}

check_pnpm() {
	log_info "Checking pnpm..."

	if command -v pnpm &>/dev/null; then
		PNPM_VERSION=$(pnpm --version)
		log_success "pnpm $PNPM_VERSION found"
		return 0
	fi

	log_info "Installing pnpm..."
	if curl -fsSL https://get.pnpm.io/install.sh | sh -; then
		export PNPM_HOME="$HOME/.local/share/pnpm"
		export PATH="$PNPM_HOME:$PATH"
		log_success "pnpm installed"
	else
		log_error "Failed to install pnpm"
		log_info "Install manually: https://pnpm.io/installation"
		exit 1
	fi
}

check_git() {
	log_info "Checking Git..."

	if command -v git &>/dev/null; then
		log_success "Git found"
		return 0
	fi

	log_error "Git is required"
	exit 1
}

# ============================================================================
# Installation
# ============================================================================

clone_repo() {
	log_info "Installing to $INSTALL_DIR..."

	if [ -d "$INSTALL_DIR" ]; then
		if [ -d "$INSTALL_DIR/.git" ]; then
			log_info "Existing installation found, updating..."
			cd "$INSTALL_DIR"
			git fetch origin
			git checkout "$BRANCH"
			git pull --ff-only origin "$BRANCH"
			log_success "Updated to latest $BRANCH"
		else
			log_error "Directory exists but is not a git repository: $INSTALL_DIR"
			log_info "Remove it or choose a different directory with --dir"
			exit 1
		fi
	else
		log_info "Cloning openzosma repository..."
		git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
		log_success "Repository cloned"
	fi

	cd "$INSTALL_DIR"
}

install_deps() {
	log_info "Installing dependencies (this may take a minute)..."
	pnpm install --no-frozen-lockfile
	log_success "Dependencies installed"
}

build_harness() {
	log_info "Building pi-harness..."
	pnpm --filter @openzosma/pi-harness build
	log_success "Pi-harness built successfully"
}

setup_path() {
	log_info "Setting up pi-harness command..."

	mkdir -p "$HOME/.local/bin"

	# Create wrapper script
	cat >"$HOME/.local/bin/pi-harness" <<'EOF'
#!/bin/bash
# Pi-Harness wrapper script
# Auto-loads .env from ~/.pi-harness/ if present

PI_HARNESS_DIR="${PI_HARNESS_DIR:-$HOME/.pi-harness/openzosma}"
ENV_FILE="$HOME/.pi-harness/.env"

if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

cd "$PI_HARNESS_DIR"
exec pnpm --filter @openzosma/pi-harness start "$@"
EOF
	chmod +x "$HOME/.local/bin/pi-harness"

	# Create TUI wrapper
	cat >"$HOME/.local/bin/pi-harness-tui" <<'EOF'
#!/bin/bash
# Pi-Harness TUI client wrapper

PI_HARNESS_DIR="${PI_HARNESS_DIR:-$HOME/.pi-harness/openzosma}"
ENV_FILE="$HOME/.pi-harness/.env"

if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

cd "$PI_HARNESS_DIR"
exec pnpm --filter @openzosma/pi-harness tui "$@"
EOF
	chmod +x "$HOME/.local/bin/pi-harness-tui"

	# Ensure ~/.local/bin is on PATH
	if ! echo "$PATH" | tr ':' '\n' | grep -q "^$HOME/.local/bin$"; then
		SHELL_CONFIG=""
		case "$(basename "$SHELL")" in
		zsh)
			SHELL_CONFIG="$HOME/.zshrc"
			;;
		bash)
			SHELL_CONFIG="$HOME/.bashrc"
			;;
		esac

		if [ -n "$SHELL_CONFIG" ]; then
			echo "" >>"$SHELL_CONFIG"
			echo "# Pi-Harness — ensure ~/.local/bin is on PATH" >>"$SHELL_CONFIG"
			echo 'export PATH="$HOME/.local/bin:$PATH"' >>"$SHELL_CONFIG"
			log_success "Added ~/.local/bin to PATH in $SHELL_CONFIG"
		fi
	fi

	export PATH="$HOME/.local/bin:$PATH"
	log_success "Commands ready: pi-harness, pi-harness-tui"
}

run_setup_wizard() {
	if [ "$SKIP_SETUP" = true ]; then
		log_info "Skipping setup wizard (--skip-setup)"
		return 0
	fi

	if ! [ -e /dev/tty ]; then
		log_info "Setup wizard skipped (no terminal available)"
		log_info "Run setup later: $INSTALL_DIR/packages/pi-harness/scripts/setup.sh"
		return 0
	fi

	echo ""
	log_info "Starting setup wizard..."
	echo ""

	bash "$INSTALL_DIR/packages/pi-harness/scripts/setup.sh" </dev/tty
}

print_success() {
	echo ""
	echo -e "${GREEN}${BOLD}"
	echo "┌─────────────────────────────────────────────────────────┐"
	echo "│              ✓ Installation Complete!                   │"
	echo "└─────────────────────────────────────────────────────────┘"
	echo -e "${NC}"
	echo ""

	echo -e "${CYAN}${BOLD}📁 Your files:${NC}"
	echo ""
	echo -e "   ${YELLOW}Install:${NC}  $INSTALL_DIR"
	echo -e "   ${YELLOW}Config:${NC}   ~/.pi-harness/.env"
	echo -e "   ${YELLOW}Data:${NC}     ~/.pi-harness/workspace/"
	echo ""

	echo -e "${CYAN}${BOLD}🚀 Commands:${NC}"
	echo ""
	echo -e "   ${GREEN}pi-harness${NC}          Start the server"
	echo -e "   ${GREEN}pi-harness-tui${NC}      Start the TUI client"
	echo ""

	echo -e "${CYAN}${BOLD}📖 Next steps:${NC}"
	echo ""
	echo -e "   1. Set your API key in ${YELLOW}~/.pi-harness/.env${NC}"
	echo -e "   2. Run ${GREEN}pi-harness${NC} to start the server"
	echo -e "   3. Run ${GREEN}pi-harness-tui${NC} in another terminal to chat"
	echo ""

	if ! echo "$PATH" | tr ':' '\n' | grep -q "^$HOME/.local/bin$"; then
		echo -e "${YELLOW}⚡ Reload your shell:${NC}"
		case "$(basename "$SHELL")" in
		zsh) echo "   source ~/.zshrc" ;;
		bash) echo "   source ~/.bashrc" ;;
		*) echo "   source ~/.bashrc   # or ~/.zshrc" ;;
		esac
		echo ""
	fi
}

# ============================================================================
# Main
# ============================================================================

main() {
	print_banner
	detect_os
	check_node
	check_pnpm
	check_git
	clone_repo
	install_deps
	build_harness
	setup_path
	run_setup_wizard
	print_success
}

main
