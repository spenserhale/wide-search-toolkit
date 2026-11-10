# @wide-search-toolkit/mcp

FastMCP stdio server for wide-search.

## Tools

| Tool | Description |
|---|---|
| `search_wide` | Fan a query out to configured vendors, dedupe, rank, and report per-vendor status/cost |
| `fetch_pages` | Fetch full page text for up to 20 public HTTP(S) URLs with SSRF and size guards |
| `list_vendors` | Show configured vendors, limits, freshness support, and estimated costs |

## Setup

MCP hosts can provide credentials in five ways:

0. **OS keychain (recommended)** — store keys once with the CLI (`wide-search auth set <vendor>`); the server reads them on each tool call, so the host config needs no `env` block and holds no secrets.
1. **Host `env` block** — works without a keychain; values are plaintext in the host config.
2. **Inherited terminal environment** — works only when the host was launched from that shell.
3. **User config** — `~/.config/wide-search/config.json`; reliable regardless of host cwd, plaintext if it contains `keys`.
4. **`op run` wrapper** — no plaintext at rest; the host runs `op run --env-file=<op-reference-template> -- bun run ...`.

### Option 0: keychain, no `env` block

```bash
wide-search auth set exa          # hidden prompt
pbpaste | wide-search auth set tavily --stdin
```

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

Keys added or rotated with `auth set` are picked up on the next tool call without restarting the host. On macOS the first read from a new binary may show a Keychain access dialog; choose Always Allow.

### Option 1: host `env` block

```json
{
  "mcpServers": {
    "wide-search": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/wide-search-toolkit/packages/mcp/src/index.ts"],
      "env": {
        "EXA_API_KEY": "…",
        "TAVILY_API_KEY": "…"
      }
    }
  }
}
```

### Options 2 and 3: inherited terminal env or user config

The server uses the same resolver as the CLI: process environment, nearest `.env` from cwd, OS keychain, `~/.config/wide-search/config.json`, then defaults. An MCP host supplies the process environment and chooses the cwd; it does not automatically share your interactive shell. Exports from the same terminal are inherited only if the host was launched from that shell. Putting non-secret defaults in `~/.config/wide-search/config.json` works regardless of host cwd.

### Option 4: `op run` wrapper

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

The template contains only `op://` references. `op run` needs the host to provide the real `HOME` (or `OP_ACCOUNT` / `OP_SERVICE_ACCOUNT_TOKEN`) so it can find your 1Password account; a stripped HOME reports “No accounts configured.” `list_vendors()` shows which vendors the running server actually sees. Host `env` values and user-config `keys` are plaintext at rest; see the [configuration guide](../../docs/guides/configuration.md).

Partial vendor failure is returned in the report (`vendors[]`), not thrown. `fetch_pages` blocks private-network targets unless `WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1` is set by the operator.

See the repo [README](../../README.md) and [security guide](../../docs/guides/security.md).
