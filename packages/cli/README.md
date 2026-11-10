# @wide-search-toolkit/cli

Agent-native Stricli CLI for wide-search.

```bash
bun install
bun run build
node dist/bin.js --help

# or from the repo root
bun run dev:cli -- search "query" --json
```

Commands: `search`, `fetch`, `vendors`, `config show`, `cache clear|stats`, `agent-context`, `feedback`.

Formats: `toon` (default), `json`, `csv`, `text`. `--deliver file:<path>` writes atomically; webhook delivery is deferred for v0.1.

## Environment

Setup options for the CLI:

1. **OS keychain (recommended)** — `wide-search auth set <vendor>` prompts with hidden input, or reads `--stdin` for scripts and agents (`pbpaste | wide-search auth set exa --stdin`). `auth list` shows keychain state and active source, `auth migrate` moves `.env` / config-file keys in, `auth delete <vendor> --yes` removes them.
2. **Terminal exports** — `export EXA_API_KEY="$(op read 'op://Private/Exa/default')"`; lives in shell memory.
3. **`op run`** — `op run --env-file="$HOME/.config/wide-search/op.env.tpl" -- wide-search ...`; no rendered file.
4. **Project `.env`** — found by walking up from cwd; plaintext at rest.
5. **User config** — `~/.config/wide-search/config.json`; plaintext if it contains `keys`.
6. **CLI flags** — per-call overrides such as `--vendor`, `--budget-usd`, `--mode`.

The resolver precedence is process environment, nearest `.env` from cwd, OS keychain, user config, then defaults. Set `WIDE_SEARCH_KEYCHAIN=0` to skip the keychain. `wide-search config show` shows the winning source per value and keys only as set/missing.

See the repo [configuration guide](../../docs/guides/configuration.md) for CLI vs MCP setup, plaintext trade-offs, and troubleshooting. `../../wide-search-cli/SKILL.md` is the agent-facing reference.
