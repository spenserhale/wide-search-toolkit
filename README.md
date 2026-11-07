# wide-search-toolkit

Fan one query out to several independent web-search vendors, normalize and dedupe the results by canonical URL, rank with reciprocal rank fusion, and report each vendor's status, latency, and estimated cost.

One vendor's index has gaps. Agreement between vendors is a useful signal, and a result only one vendor finds shows you where the others are blind. `wide-search` makes that comparison one call.

```
packages/sdk/   Types, vendor adapters, fan-out engine, cache, safe page fetching
    ^       ^
    |       |
packages/cli/   packages/mcp/
(Stricli)       (FastMCP stdio)
```

The CLI and MCP server are thin consumers. All API and ranking logic lives in the SDK.

## What you get

- **SDK**: `searchWide()` returns merged results plus a per-vendor report; `fetchPages()` reads full page text with SSRF and size guards.
- **CLI**: `wide-search search`, `fetch`, `vendors`, `config show`, `cache clear|stats`, `agent-context`, `feedback`.
- **MCP server**: `search_wide`, `fetch_pages`, `list_vendors`.
- **Skill**: `wide-search-cli/SKILL.md`, generated from the live command tree.

## Quick start

```bash
bun install
cp .env.example .env
# Set at least one vendor key in .env
bun run dev:cli -- search "latest approaches to hybrid retrieval" --json

# Or build and symlink the binary into ~/.local/bin
bash scripts/install.sh
```

Useful first commands:

```bash
wide-search vendors                                      # which keys are configured?
wide-search search "query" --vendor exa --vendor tavily   # narrow the candidate set
wide-search search "query" --mode fast --budget-usd 0.01  # cheaper, faster fan-out
wide-search fetch https://example.com/article --json      # full page text
wide-search agent-context --json                          # machine-readable CLI surface
```

Run from the repo with `bun run dev:cli -- ...`, or build the binary with `bun run build` and run `node packages/cli/dist/bin.js ...`.

## Vendors

| Vendor | Env keys | Freshness | Max results | Est. fast $ | Est. standard $ |
|---|---|---|---|---|---|
| Exa | `EXA_API_KEY` | yes | 100 | 0.0050 | 0.0050 |
| Tavily | `TAVILY_API_KEY` | yes | 20 | 0.0080 | 0.0080 |
| Parallel | `PARALLEL_API_KEY` | yes | 20 | 0.0010 | 0.0050 |
| Perplexity | `PERPLEXITY_API_KEY` | yes | 20 | 0.0050 | 0.0050 |
| DataForSEO | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | no | 100 | 0.0020 | 0.0020 |
| Z.AI | `ZAI_API_KEY` (or `Z_AI_API_KEY`) | yes | 50 | 0.0100 | 0.0100 |
| Ollama Cloud | `OLLAMA_API_KEY` | no | 10 | 0.0100 | 0.0100 |
| Firecrawl | `FIRECRAWL_API_KEY` | yes | 100 | 0.0020 | 0.0020 |
| TinyFish | `TINYFISH_API_KEY` | yes | 10 | 0.0010 | 0.0010 |

Costs are estimates, not vendor invoices. The default per-call budget is **$0.05**. Vendors are selected cheapest-first until the whole estimated call fits the remaining budget. `--vendor` narrows the candidate set; it does not bypass the budget. Skipped vendors are reported as `skipped_budget` or `skipped_unconfigured`, distinct from `ok` with zero results.

## Output

Formats: `toon` (default, agent-friendly), `json` (full report envelope), `csv` (flat rows), `text` (human layout). `WIDE_SEARCH_OUTPUT` sets the default; flags win.

- `--json` / `--toon`: full report, including `vendors[]`, cache state, stats, and hints.
- `--csv`: flat merged result rows for `search`, flat page rows for `fetch`, flat vendor rows for `vendors`.
- `--deliver file:<path>`: atomic file write. Webhook delivery is deferred for v0.1 because it needs the same SSRF guard as page fetching.

Partial vendor failure exits 0; read `vendors[]` instead of treating an empty result as proof that nothing exists. When every selected vendor fails, the CLI exits with the first vendor's enumerated error code.

## Configuration

The CLI and MCP server share one resolver; only where the process environment comes from differs.

```
process environment  >  nearest .env walking up from cwd  >  ~/.config/wide-search/config.json  >  built-in default
```

| Surface | Process environment comes from | Project `.env` | Recommended persistent setup |
|---|---|---|---|
| CLI | your shell, `op run`, or CI | walks up from cwd | `op run --env-file=... -- wide-search ...` |
| MCP | the host's `env` block plus inherited env | only if the server's cwd is inside the project | host `env`, user config, or an `op run` wrapper |

A terminal `export` works for the CLI immediately. For MCP it works only when the host inherited that shell environment — a GUI host launched by the operating system usually did not. If a key works in the CLI but not in MCP, check the host's cwd and `env` block first. `wide-search config show` reports the CLI's winning source per value; `wide-search vendors` and the MCP `list_vendors` tool show which vendors are configured.

For a no-plaintext setup, keep a template with `op://` references and inject at run time:

```bash
eval "$(op signin)"
op run --env-file="$HOME/.config/wide-search/op.env.tpl" -- wide-search search "query" --json
```

MCP hosts can wrap the server command in `op run` instead of putting keys in the host config:

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

Optional non-secret user config (`~/.config/wide-search/config.json`):

```json
{
  "vendors": ["exa", "tavily", "parallel", "perplexity"],
  "budgetUsd": 0.05,
  "timeoutMs": 8000
}
```

If you put `keys` in that file, or literal values in an MCP host `env` block, they are plaintext at rest. `WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1` is the explicit opt-in for private-network page fetches; it is not a per-call MCP argument.

Full setup and troubleshooting: [configuration guide](docs/guides/configuration.md).

## MCP

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

Tools:

- `search_wide(query, vendors?, max_per_vendor?, freshness?, mode?, budget_usd?, limit?, no_cache?)`
- `fetch_pages(urls, max_chars_per_page?, max_total_chars?, timeout_ms?, concurrency?)`
- `list_vendors()`

The MCP server reads the same environment and config file as the CLI.

## Ranking and cache

- **Dedupe**: canonical URL — lower-case host, strip `www`, tracking parameters, fragments, and trailing slashes; sort query parameters.
- **Rank**: reciprocal rank fusion (k = 60). A vendor contributes its best rank once per canonical URL, so duplicate URLs cannot stuff the ranking. Ties break on `found_by`, then best rank, then canonical URL.
- **Found by**: the number of vendors that returned the URL; a useful agreement signal, not independent corroboration.
- **Cache**: complete successful aggregates only, 15-minute TTL, keyed by the effective execution plan (query, selected vendors, max per vendor, freshness, mode, limit). Partial results are never cached. `--no-cache` bypasses reads and writes.

## Security

`fetch` is an arbitrary-URL primitive, so it is guarded:

- HTTP(S) only; no embedded credentials.
- Blocked by default: loopback, private, link-local, multicast, reserved, documentation, metadata, and IPv4-mapped IPv6 destinations.
- DNS is resolved once, every address is checked, and the chosen address is pinned into the connection to shrink the DNS-rebinding window.
- Redirects are validated at every hop, capped at five.
- Per-page and aggregate character caps; compressed bodies are decompressed with a byte cap.

See [docs/guides/security.md](docs/guides/security.md).

## Development

```bash
bun install
bun test                 # 68 pass, 3 opt-in E2E skipped
bun run lint             # tsc --noEmit in every package
bun run build            # SDK, CLI, MCP
bun run build:skill      # regenerate wide-search-cli/SKILL.md
```

The default test run never calls live vendors. Adapter tests mock `fetch`; the engine tests inject fake adapters; `fetchPages` tests use a local HTTP server.

## Live 1Password E2E

The five real adapters (Exa, Tavily, Parallel, Firecrawl, TinyFish) are verified end-to-end through both the CLI and the MCP server. The E2E files are opt-in, and `tests/e2e/op.env.tpl` contains only `op://` references — no API keys:

```bash
eval "$(op signin)"
WIDE_SEARCH_OP_E2E=1 bun run test:e2e:op
```

`op inject` renders the references into the test process memory; the rendered values are passed to the child CLI/MCP environment and are never written to disk or printed. See [tests/e2e/README.md](tests/e2e/README.md).

## Docs

- [Vision](docs/product/vision.md)
- [Spec](docs/specs/wide-search.md)
- [Decisions](docs/decisions/)
- [Plan](docs/plans/2026-11-07-initial-wide-search.md)
- [1Password E2E plan](docs/plans/2026-11-07-op-inject-e2e.md)
- [CLI vs MCP configuration guide](docs/guides/configuration.md)
- [Vendor guide](docs/guides/vendors.md)
- [Security guide](docs/guides/security.md)
- [Testing guide](docs/guides/testing.md)
- [Agent router](AGENTS.md)

## v0.1 boundaries

No profiles, job ledger, self-upgrade, webhook delivery, or raw vendor payload retention. Those are deliberate cuts, not missing wiring. See the [plan](docs/plans/2026-11-07-initial-wide-search.md).
