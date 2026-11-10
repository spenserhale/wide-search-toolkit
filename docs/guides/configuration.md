---
title: "Configuration and environment setup"
description: Read this when setting up vendor keys for the CLI or an MCP host, storing keys in the OS keychain, or when a CLI command works but the MCP server cannot see the same credentials.
---

## Purpose

Read this guide when configuring a machine for `wide-search`, comparing CLI and MCP setup, or debugging a credential that works in one surface but not the other.

## The shared resolver

The CLI, MCP server, and SDK default all call the same `loadConfig()` in `packages/sdk/src/config.ts`. The precedence is identical:

```
process environment
  > nearest .env walking up from the current working directory
  > OS keychain (vendor keys only; service "wide-search")
  > ~/.config/wide-search/config.json
  > built-in default
```

The keychain is only asked for keys that the environment and `.env` files did not supply, so an explicit key never triggers a keychain prompt. If the keychain is unavailable (no Secret Service on Linux, a locked keychain, a non-Bun runtime), the lookup is skipped and the rest of the chain works as before. Set `WIDE_SEARCH_KEYCHAIN=0` to turn the lookup off. See [decision 0007](../decisions/0007-os-keychain-credential-store.md).

The difference is **where the process environment comes from**:

| Surface | Process environment source | Project `.env` discovery | Best persistent setup |
|---|---|---|---|
| CLI | Your shell, `op run`, or CI | Walks up from the directory where you run `wide-search` | `wide-search auth set <vendor>` (keychain), or `op run` |
| MCP | The host's `env` block plus whatever the host inherits | Only if the server's cwd is inside the project; many hosts launch from elsewhere | The keychain (no `env` block needed), or an `op run` wrapper |

An MCP host is not a shell. It spawns the server as a child process with a `command`, `args`, and `env`. If you put a key in a project `.env`, the CLI finds it from the project root, but the MCP server only finds it if the host happens to start the server with that project as cwd. Do not rely on that. The keychain does not depend on cwd or inherited env, so a key stored once with `wide-search auth set` reaches both surfaces.

## Setup options at a glance

| Option | CLI | MCP | Plaintext at rest? | When to use |
|---|---|---|---|---|
| **OS keychain (`wide-search auth set`)** | Yes | Yes, with no `env` block | No; encrypted by the OS | Default persistent setup on a desktop machine |
| Terminal exports (`export KEY=...`) | Yes | Conditional: only if the host inherited that shell | No file; process memory | Quick CLI session; a host launched from the same terminal |
| **MCP host `env` block** | Not applicable | Yes | Yes, in the host config | Simplest persistent MCP setup |
| `op run --env-file=<op-reference-template>` | Yes | Yes, as a wrapper command | No rendered file | No-plaintext setup for either surface |
| Project `.env` | Yes, walking up from cwd | Only if the server's cwd is inside the project | Yes | Local development convenience |
| User config `~/.config/wide-search/config.json` | Yes | Yes | Yes if it contains `keys` | Non-secret defaults; machine-wide options |
| CLI flags / MCP tool arguments | Yes | Yes | No | Per-call overrides only |

The **OS keychain** is the recommended persistent option for both surfaces on a desktop machine. `op run` is the recommended option when keys already live in 1Password or the machine is headless. Every option uses the same variable names (keychain entries are named by env var), so a key moved from one option to another keeps working.

## OS keychain setup

`wide-search auth` stores keys with `Bun.secrets`: macOS Keychain Services, Linux libsecret (GNOME Keyring, KWallet), or Windows Credential Manager. Each entry uses service `wide-search` and the env-var name as the account, for example `wide-search` / `EXA_API_KEY`. On macOS you can see and delete them in Keychain Access.app.

### Interactive: hidden prompt

On a terminal, `auth set` prompts without echoing what you type or paste:

```bash
wide-search auth set exa
# EXA_API_KEY: ••••••••   (nothing is shown)
# stored EXA_API_KEY in os-keychain:wide-search

wide-search auth set dataforseo     # prompts for DATAFORSEO_LOGIN, then DATAFORSEO_PASSWORD
```

### Non-interactive: `--stdin`

Scripts and agents pipe the value with `--stdin`. One key per call; vendors with two keys need `--key`:

```bash
pbpaste | wide-search auth set exa --stdin                # macOS clipboard
op read 'op://Private/Tavily/default' | wide-search auth set tavily --stdin
printf '%s' "$FIRECRAWL_API_KEY" | wide-search auth set firecrawl --stdin
op read 'op://Private/DataForSEO/username' | wide-search auth set dataforseo --key DATAFORSEO_LOGIN --stdin
op read 'op://Private/DataForSEO/password' | wide-search auth set dataforseo --key DATAFORSEO_PASSWORD --stdin
```

Without a terminal and without `--stdin`, `auth set` exits 2 instead of hanging. The key is never accepted as an argument or flag value, because arguments land in shell history and `ps` output. Add `--dry-run` to validate without writing.

### Related commands

| Command | What it does |
|---|---|
| `wide-search auth set <vendor> [--key NAME] [--stdin] [--dry-run]` | Store a key. Output flags a key that an env var or `.env` still overrides (`shadowed_by`). |
| `wide-search auth list` | Every credential key with keychain `set`/`missing` and the active source. Never prints values. |
| `wide-search auth delete <vendor> [--key NAME] --yes [--dry-run]` | Remove keychain entries. Refuses without `--yes`. |
| `wide-search auth migrate [--dry-run] [--overwrite]` | Copy keys whose active source is a `.env` file or the user config into the keychain. Skips keys already stored unless `--overwrite`. Leaves process-environment keys (op run, CI) alone. Does not edit files; it lists them under `clean_up`. |

A typical move off a plaintext `.env`:

```bash
wide-search auth migrate --dry-run   # see what would move
wide-search auth migrate             # store them
# delete the listed keys from each clean_up file: a .env value keeps overriding the keychain
wide-search auth list                # active source should now read "keychain"
```

### Keychain caveats

- **Access prompts (macOS).** The process that created an entry can read it silently. A different binary may trigger a "wants to use your confidential information" dialog the first time, for example after some Bun upgrades or from a compiled binary. Choose **Always Allow**. A GUI MCP host shows the same dialog on screen.
- **Linux** needs a running Secret Service daemon. Headless servers and CI often have none; there, `loadConfig()` reports `keychain.status: "unavailable"` and you should use env vars or `op run`.
- **Runtime.** The lookup needs Bun (the CLI and MCP server already run on Bun). SDK consumers on Node skip it.
- **Threat model.** The keychain keeps keys out of files that get committed, synced, backed up, or read by other tools. It does not protect against malware already running as your user once access has been granted.

## CLI setup

### 1Password: inject at run time

Create a private template containing only `op://` references (never literal keys):

```text
# ~/.config/wide-search/op.env.tpl
EXA_API_KEY=op://Private/Exa/default
TAVILY_API_KEY=op://Private/Tavily/default
PARALLEL_API_KEY=op://Private/Parallel/default
FIRECRAWL_API_KEY=op://Private/Firecrawl/default
TINYFISH_API_KEY=op://Private/TinyFish/default
```

Then run the CLI through `op run`:

```bash
eval "$(op signin)"
op run --env-file="$HOME/.config/wide-search/op.env.tpl" -- \
  wide-search search "TypeScript programming language" --json
```

`op run` injects the values into the command's process environment. It does not write a rendered `.env` file.

### Local convenience: project `.env`

A `.env` at the repo root (or any parent of the current directory) is read automatically. This is convenient for local development, but it is **plaintext at rest** and must stay gitignored. Use `op run` when the no-plaintext rule matters.

```bash
cp .env.example .env
# edit .env, or leave it empty and use op run instead
wide-search vendors
```

### Machine-wide defaults

`~/.config/wide-search/config.json` is convenient for non-secret defaults and, optionally, keys. Keys stored there are plaintext at rest.

```json
{
  "vendors": ["exa", "tavily", "parallel", "firecrawl", "tinyfish"],
  "budgetUsd": 0.05,
  "timeoutMs": 8000,
  "fetchTimeoutMs": 15000,
  "keys": {
    "exa": "…",
    "tavily": "…"
  }
}
```

Set `WIDE_SEARCH_CONFIG_FILE` to use a different path. `wide-search config show` reports the winning source for each value and shows keys only as `set` or `missing`.

## Terminal session environment

Exporting keys in the shell works immediately for the CLI:

```bash
export EXA_API_KEY="$(op read 'op://Private/Exa/default')"
export TAVILY_API_KEY="$(op read 'op://Private/Tavily/default')"
wide-search vendors
```

The value lives in the shell process environment, not in a file. The `op read` command in shell history contains only the reference, not the key.

For MCP, inherited environment depends on **how the host was launched**. A host started from that same terminal, or a CLI-based MCP client run in that shell, inherits the exports. A GUI app launched by the operating system usually does not. If `list_vendors()` shows zero configured, use the host `env` block, the user config, or an `op run` wrapper instead of relying on the terminal session.

## MCP setup

### Recommended: keychain, no `env` block

Store keys once with `wide-search auth set <vendor>` (see [OS keychain setup](#os-keychain-setup)), then register the server with no secrets at all:

```json
{
  "mcpServers": {
    "wide-search": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/wide-search-toolkit/packages/mcp/src/index.ts"]
    }
  }
}
```

The server reads the keychain on each tool call, so a key added or rotated with `auth set` is picked up without restarting the host. The host config file holds no secrets, so it is safe to commit (for example a project `.mcp.json`) or sync. Check with `list_vendors()`; if a vendor shows unconfigured, run `wide-search auth list` and look for a macOS access dialog the host may be waiting on.

### Option A: host `env` block

This works everywhere, including hosts without a keychain, but the values are plaintext in the host config:

```json
{
  "mcpServers": {
    "wide-search": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/wide-search-toolkit/packages/mcp/src/index.ts"],
      "env": {
        "EXA_API_KEY": "…",
        "TAVILY_API_KEY": "…",
        "PARALLEL_API_KEY": "…",
        "FIRECRAWL_API_KEY": "…",
        "TINYFISH_API_KEY": "…"
      }
    }
  }
}
```

If the host config file is the only place those keys live, protect it like any other secret store. They are not hidden by the MCP server.

### Option B: no-plaintext `op run` wrapper

Keep the host `env` block empty and make the server command `op`:

```json
{
  "mcpServers": {
    "wide-search": {
      "command": "op",
      "args": [
        "run",
        "--env-file",
        "/Users/you/.config/wide-search/op.env.tpl",
        "--",
        "bun",
        "run",
        "/absolute/path/to/wide-search-toolkit/packages/mcp/src/index.ts"
      ]
    }
  }
}
```

The template contains only `op://` references. `op run` injects the values into the server process; no rendered file is written.

Three operational notes:

- `op run` may need 1Password unlocked. A GUI MCP host with the 1Password app integration usually handles this; a headless host may need a 1Password service account token and a non-interactive `op` setup.
- `op run` must be able to find your 1Password account. Keep the real `HOME` available, or set `OP_ACCOUNT` / `OP_SERVICE_ACCOUNT_TOKEN`. A stripped or temporary `HOME` makes `op` report “No accounts configured.”
- If the host sanitizes the child environment, it must pass through `OP_SERVICE_ACCOUNT_TOKEN`, `OP_ACCOUNT`, or the signed-in `op` session for the wrapper to work. Check the host's MCP process settings.

### Option C: user config

Because the MCP server always reads `~/.config/wide-search/config.json`, a machine-wide config is reliable regardless of the host's cwd:

```json
{
  "vendors": ["exa", "tavily", "parallel", "firecrawl", "tinyfish"],
  "budgetUsd": 0.05
}
```

Keep keys out of that file and use Option B if the no-plaintext rule applies.

### Option D: inherited terminal environment

If you launch the MCP host from the same terminal session, it may inherit the exports described in [Terminal session environment](#terminal-session-environment):

```bash
export EXA_API_KEY="$(op read 'op://Private/Exa/default')"
# then launch the MCP host from this shell
```

This writes no file, but a GUI host launched by the operating system usually starts outside that shell. Check `list_vendors()` to confirm the host actually received the variables.

## Diagnostics

| Surface | Command/tool | What it shows |
|---|---|---|
| CLI | `wide-search config show --json` | Resolved values, winning sources (`env`, `envfile:<path>`, `keychain`, `config:<path>`), keys as set/missing, `keychain.status` |
| CLI | `wide-search auth list` | Keychain set/missing per key and the active source |
| CLI | `wide-search vendors --json` | Nine vendors, configured true/false, limits, freshness, costs |
| MCP | `list_vendors()` | Vendor catalog with configured true/false |
| Both | `search_wide` / `search` `vendors[]` | Per-vendor `ok`, `timeout`, `error`, `skipped_budget`, `skipped_unconfigured` |

If the CLI sees a key but the MCP server does not, check the MCP host's cwd and `env` block first. The server does not share your interactive shell's environment automatically.

Values that are clearly not keys are ignored in every source and the next source is tried: blank values, `.env` comments (`KEY= # paste here`), unresolved `op://` references, and unexpanded `$NAME` / `${NAME}` references (common in MCP host `env` blocks that do not expand variables). When nothing usable remains, the source reads `ignored:<source> (<reason>)`, for example `ignored:env (unresolved 1Password reference; run through op run or op inject)`, and the vendor is reported as `skipped_unconfigured` without a request. A real but wrong or revoked key still reaches the vendor and fails with `E_AUTH`; `credential_sources` tells you where it came from.

## Per-call overrides

- CLI: `--vendor`, `--max-per-vendor`, `--mode`, `--budget-usd`, `--freshness`, `--limit`, `--timeout-ms`, `--no-cache`.
- MCP: `vendors`, `max_per_vendor`, `mode`, `budget_usd`, `freshness`, `limit`, `no_cache` on `search_wide`; page caps and timeout on `fetch_pages`.
- Both: `WIDE_SEARCH_*` environment variables for defaults, `WIDE_SEARCH_OUTPUT` for the CLI output format.

## Secrets at rest

These are all plaintext at rest and must be protected or avoided:

- a project `.env`;
- `~/.config/wide-search/config.json` if it contains `keys`;
- an MCP host `env` block with literal key values.

The OS keychain (`wide-search auth set`) and `op run --env-file=<template-with-op-references>` are the two no-plaintext paths for both surfaces. Use `wide-search auth migrate` to move existing plaintext keys into the keychain. The E2E harness uses `op inject` in memory for the same reason; see [testing](testing.md) and [decision 0006](../decisions/0006-op-inject-e2e-secrets.md).

## Related docs

- [Vendor adapters](vendors.md)
- [Security](security.md)
- [Testing](testing.md)
- [Spec](../specs/wide-search.md)
