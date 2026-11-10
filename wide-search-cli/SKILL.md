---
name: wide-search-cli
description: "Reference for the `wide-search` CLI (from spenserhale/wide-search-toolkit), which fans one query out to several independent web-search vendors, dedupes by canonical URL, ranks with reciprocal rank fusion, and reports per-vendor status, latency, and estimated cost. Trigger whenever the user wants broad web research, multiple search engines compared, vendor-gap or disagreement analysis, or a search result set that is wider than one vendor's index — even if they do not name the CLI. Prefer it over hand-rolling curl against each vendor: it handles parallel fan-out, timeouts, partial failures, budget selection, and page fetching."
---

# wide-search CLI

Version 0.1.0. Fan one query out to multiple independent web-search vendors, normalize and dedupe by canonical URL, rank with reciprocal rank fusion, and report each vendor's status, latency, and estimated cost.

## Start here

```bash
wide-search search "latest approaches to hybrid retrieval" --json
wide-search search "topic" --vendor exa --vendor tavily --toon
wide-search fetch https://example.com/article --json
wide-search vendors
wide-search agent-context --json
```

Run `wide-search agent-context --json` for the full machine-readable surface. It is generated from the live command tree, so it matches `--help`.

## Output

Formats: `toon`, `json`, `csv`, `text`. Default `toon`; WIDE_SEARCH_OUTPUT sets the default; flags win. Use `--toon` when you are the consumer (fewest tokens), `--json` for the full report envelope, and `--csv` only for flat rows.

CSV is flat result rows for search, flat page rows for fetch, and flat vendor rows for vendors. JSON/TOON carry the full envelope.

## Vendor selection and cost

- All configured vendors by default, cheapest estimated cost first; a vendor is selected only when its whole estimated call fits the remaining budget.
- Default budget: $0.05 per call. Budget is an estimate cap, not a billing guarantee. Costs are estimates, not vendor invoices.
- `--vendor` narrows the candidate set; it does not bypass the budget.

| Vendor | Env keys | Freshness | Max results | Fast $ | Standard $ |
|---|---|---|---|---|---|
| Exa (`exa`) | `EXA_API_KEY` | yes | 100 | 0.0050 | 0.0050 |
| Tavily (`tavily`) | `TAVILY_API_KEY` | yes | 20 | 0.0080 | 0.0080 |
| Parallel (`parallel`) | `PARALLEL_API_KEY` | yes | 20 | 0.0010 | 0.0050 |
| Perplexity (`perplexity`) | `PERPLEXITY_API_KEY` | yes | 20 | 0.0050 | 0.0050 |
| DataForSEO (`dataforseo`) | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | no | 100 | 0.0020 | 0.0020 |
| Z.AI (`zai`) | `ZAI_API_KEY`, `Z_AI_API_KEY` | yes | 50 | 0.0100 | 0.0100 |
| Ollama Cloud (`ollama`) | `OLLAMA_API_KEY` | no | 10 | 0.0100 | 0.0100 |
| Firecrawl (`firecrawl`) | `FIRECRAWL_API_KEY` | yes | 100 | 0.0020 | 0.0020 |
| TinyFish (`tinyfish`) | `TINYFISH_API_KEY` | yes | 10 | 0.0010 | 0.0010 |

The per-vendor report in `vendors[]` distinguishes `ok`, `timeout`, `error`, `skipped_budget`, and `skipped_unconfigured`. A skipped vendor is not the same as a vendor that returned zero results.

## Ranking, dedupe, and cache

- Reciprocal rank fusion across vendors with k=60.
- Canonical URL: lower-case host, strip www, tracking parameters, fragments, and trailing slashes; sort query parameters.
- Tie-break: Score, then found_by, then best_rank, then canonical URL.
- Freshness is a vendor request filter where supported; it is not an implicit date decay in ranking.
- Cache: Complete successful aggregates only; partial results are never cached; TTL 900000 ms. Use --no-cache to bypass both cache reads and cache writes.

## Fetching pages

- `fetch` accepts up to 20 URLs per call.
- Per-page cap 20,000 chars; aggregate cap 100,000 chars; per-URL timeout 15,000 ms.
- Loopback, private, link-local, multicast, reserved, metadata, and IPv4-mapped IPv6 targets are blocked unless WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1.

## Configuration

- `EXA_API_KEY` — Exa API key
- `TAVILY_API_KEY` — Tavily API key
- `PARALLEL_API_KEY` — Parallel API key
- `PERPLEXITY_API_KEY` — Perplexity API key
- `DATAFORSEO_LOGIN` — DataForSEO login (paired with DATAFORSEO_PASSWORD)
- `DATAFORSEO_PASSWORD` — DataForSEO password
- `ZAI_API_KEY` — Z.AI API key (Z_AI_API_KEY also accepted)
- `OLLAMA_API_KEY` — Ollama Cloud API key
- `FIRECRAWL_API_KEY` — Firecrawl API key
- `TINYFISH_API_KEY` — TinyFish API key
- `WIDE_SEARCH_VENDORS` — Comma-separated default vendor list (default: all vendors)
- `WIDE_SEARCH_TIMEOUT_MS` — Per-vendor timeout in milliseconds (default 8000)
- `WIDE_SEARCH_MAX_PER_VENDOR` — Default max results per vendor (default 10)
- `WIDE_SEARCH_MAX_COST_USD` — Per-call estimated-cost budget in USD (default 0.05)
- `WIDE_SEARCH_CACHE_TTL_MS` — Search cache TTL in milliseconds (default 900000; 0 disables)
- `WIDE_SEARCH_CACHE_DIR` — Cache directory (default: ~/.cache/wide-search)
- `WIDE_SEARCH_OUTPUT` — Default output format: toon | json | csv | text
- `WIDE_SEARCH_FETCH_MAX_CHARS` — Per-page fetch character cap (default 20000)
- `WIDE_SEARCH_FETCH_TOTAL_MAX_CHARS` — Aggregate fetch character cap (default 100000)
- `WIDE_SEARCH_FETCH_CONCURRENCY` — Parallel fetches (default 4)
- `WIDE_SEARCH_FETCH_TIMEOUT_MS` — Per-URL fetch timeout in milliseconds (default 15000)
- `WIDE_SEARCH_SNIPPET_CHARS` — Merged snippet character cap (default 500)
- `WIDE_SEARCH_ALLOW_PRIVATE_HOSTS` — Set 1 to allow private-network fetch targets (explicit opt-in)
- `WIDE_SEARCH_USER_AGENT` — User-Agent sent to vendors and fetched pages
- `WIDE_SEARCH_CONFIG_FILE` — Path to a JSON config file (default: ~/.config/wide-search/config.json)
- `WIDE_SEARCH_KEYCHAIN` — Set to 0 to skip reading vendor keys from the OS keychain (default: on)

Precedence: process environment > nearest `.env` walking up from cwd > OS keychain (`wide-search auth set`) > `~/.config/wide-search/config.json` > built-in default. `config show` reports the winning source for each value and never prints a secret.

## Exit codes

- `0` — E_DRY_RUN
- `1` — E_NETWORK, E_TIMEOUT, E_FETCH, E_CACHE
- `2` — E_VALIDATION, E_BUDGET
- `3` — E_CONFIG
- `4` — E_NOT_FOUND
- `5` — E_AUTH
- `6` — E_RATE_LIMIT

Partial vendor failure exits 0. When every selected vendor fails, the CLI exits with the first vendor's code.

## Quirks worth knowing

- Partial vendor failure exits 0. Read vendors[] statuses instead of treating an empty results array as proof that nothing exists.
- When every selected vendor fails, the CLI exits with the first vendor's enumerated error code.
- Costs are estimates, not vendor invoices; the vendor may bill differently.
- DataForSEO and Ollama do not support freshness filtering; the report explains the gap.
- The cache stores only complete successful aggregates; a timeout does not poison the next 15 minutes.
- fetch refuses private-network targets by default; this is an explicit config opt-in, not a per-call MCP argument.
- Default selection is all configured vendors, cheapest first, until the per-call budget is exhausted.
- The merged result keeps each vendor's best rank for a URL; a vendor cannot stuff the ranking with duplicate URLs.
- The CLI finds .env by walking up from its cwd and inherits your shell exports; an MCP host may launch the server from a different cwd and does not necessarily inherit your shell environment, so store keys in the OS keychain with `wide-search auth set` (no host env block needed), or use the host env block or an op run wrapper.
- MCP host env values and user-config keys are plaintext at rest; use the OS keychain (`wide-search auth set`, `auth migrate`) or an op run wrapper when keys must not be stored in plaintext.

## Shared flags

Most commands accept these; they are omitted from the per-command lists below.

- `--format <toon|json|csv|text>`, `--toon`, `--json`, `--csv`, `--text` — output format
- `--deliver <stdout|file:<path>>` — write to stdout (default) or an atomic file

## Commands

### `wide-search search <query>`

Calls every configured vendor in parallel (or only the vendors named with --vendor), normalizes and dedupes by canonical URL, ranks with reciprocal rank fusion, and reports each vendor's status, latency, and estimated cost. Partial vendor failures are normal; inspect vendors[] rather than assuming an empty result means the web had nothing.

- `--vendor <value>` (repeatable) — Restrict to a vendor; repeat the flag for several (default: configured vendors)
- `--max-per-vendor <value>` — Max results requested from each vendor (1-20; default: config, 10)
- `--freshness <day|week|month|year>` — Restrict to fresh results where the vendor supports it
- `--mode <fast|standard>` (default standard) — Vendor speed/quality mode
- `--budget-usd <value>` — Max estimated spend for this call in USD (default: config, 0.05)
- `--limit <value>` (default 50) — Max merged results to return, 1-100
- `--no-cache` — Bypass both cache reads and cache writes
- `--timeout-ms <value>` — Per-vendor timeout in milliseconds (default: config, 8000)

### `wide-search fetch <url?>`

Fetches HTTP(S) pages with a per-page and aggregate text cap. Loopback, private, link-local, multicast, reserved, metadata, and IPv4-mapped IPv6 destinations are blocked unless WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1 is set explicitly.

- `--url <value>` (repeatable) — Additional URL to fetch; repeat the flag for several
- `--max-chars-per-page <value>` — Per-page text cap (default: config, 20000)
- `--max-total-chars <value>` — Aggregate text cap across all pages (default: config, 100000)
- `--timeout-ms <value>` — Per-URL timeout in milliseconds (default: config, 15000)
- `--concurrency <value>` — Parallel fetches, 1-10 (default: config, 4)

### `wide-search vendors`

Shows every supported vendor, whether its keys are configured, whether it is selected by default, the maximum results per call, freshness support, and the estimated cost. Costs are estimates, not vendor invoices.

### `wide-search auth set <vendor>`

Saves the key under keychain service `wide-search`, named by its env var (e.g. EXA_API_KEY). On a terminal it prompts with hidden input. For scripts and agents, pipe the value with --stdin (one key per call; use --key for vendors with two keys such as DataForSEO). The key is never accepted as an argument, so it stays out of shell history and process listings. Env vars and .env files still take precedence over the keychain; the output flags a stored key that one of them shadows.

- `--key <value>` — Only this credential (e.g. DATAFORSEO_PASSWORD); default: every key the vendor uses
- `--stdin` — Read the key from stdin instead of prompting (non-interactive)
- `--dry-run` — Validate and report what would change without touching the keychain

### `wide-search auth list`

Lists every credential key with its keychain state (set/missing) and the source that currently wins (env, envfile:<path>, keychain, config:<path>, or missing). Values are never printed.

### `wide-search auth delete <vendor>`

Deletes the vendor's keychain entries, or only --key. Keys set through env, .env, or the user config file are not touched.

- `--key <value>` — Only this credential (e.g. DATAFORSEO_PASSWORD); default: every key the vendor uses
- `--yes` — Confirm the deletion
- `--dry-run` — Validate and report what would change without touching the keychain

### `wide-search auth migrate`

Stores every key whose active source is a .env file or ~/.config/wide-search/config.json in the OS keychain, skipping keys already there unless --overwrite. Process-environment keys (op run, CI) are left alone. Files are not edited: remove the listed clean_up lines yourself, because a .env value keeps overriding the keychain until you do.

- `--overwrite` — Replace keys that already exist in the keychain
- `--dry-run` — Validate and report what would change without touching the keychain

### `wide-search config show`

Secrets are shown as set/missing, never in plain text. The source column distinguishes environment variables, project .env files, the user config file, and built-in defaults.

### `wide-search cache clear`

Removes the search-cache JSON files for the current cache directory. The cache stores only complete successful aggregates, so clearing it only forces fresh vendor calls.

### `wide-search cache stats`

Show the cache directory, entry count, size, and oldest entry age

### `wide-search agent-context`

Defaults to JSON (use --toon or --text to override). Derived from the live Stricli route tree, so it stays in sync with --help. Pipe it to an agent before driving this CLI.

### `wide-search feedback <text>`

Writes a timestamped line to ~/.config/wide-search/feedback.jsonl, honoring XDG_CONFIG_HOME. It never posts anywhere and never prints the file contents back.

## Install / run

```bash
bun install
bun run build
bash scripts/install.sh          # symlink into ~/.local/bin
bun run dev:cli -- search "query" --json
```

The generated MCP server uses the same SDK and the same vendor configuration: `bun run dev:mcp` in this repo, or point an MCP host at the built `packages/mcp/dist/index.js`.
