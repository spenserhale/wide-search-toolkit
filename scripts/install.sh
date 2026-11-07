#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bun install
bun run build

BIN_DIR="${WIDE_SEARCH_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$BIN_DIR"
ln -sf "$ROOT/packages/cli/dist/bin.js" "$BIN_DIR/wide-search"

echo "Installed wide-search -> $BIN_DIR/wide-search"
echo "Make sure $BIN_DIR is on PATH, then run: wide-search --help"
