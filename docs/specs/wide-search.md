---
title: "Wide search"
description: What the fan-out search, ranking, per-vendor reporting, cache, and page-fetch behavior does today.
status: current
---

## Intent

One query should be able to use several independent search indexes without the caller learning each vendor's request shape, auth scheme, result schema, timeout behavior, and cost. The feature returns both a merged result set and the per-vendor truth needed to judge it: which vendors answered, which failed or were skipped, how long they took, and what they likely cost.

## Behavior

### Search

- `searchWide(query, options)` requires a non-empty query. `max_per_vendor` is bounded to 1–20, `limit` to 1–100.
- Candidate vendors are the configured default list (`WIDE_SEARCH_VENDORS`) unless `vendors` narrows it. Only vendors with complete credentials are eligible.
- Eligible vendors are selected cheapest estimated cost first. A vendor is selected only when its whole estimated call fits the remaining per-call budget. `budget_usd` defaults to `WIDE_SEARCH_MAX_COST_USD` or 0.05.
- If no vendor is configured, the SDK throws `E_CONFIG`. If the budget selects no vendor, it throws `E_BUDGET`. If some vendors are unconfigured or over budget, they are reported as `skipped_unconfigured` or `skipped_budget` and the call continues.
- Selected vendors run in parallel with a per-vendor timeout (default 8,000 ms). Partial failures do not discard successful results.
- Each adapter returns normalized rows `{title, url, snippet, date?, vendor, rank}`. Adapters validate their own vendor response shape and preserve the vendor's 1-based rank.
- Results are deduped by canonical URL: lower-case host, strip `www`, tracking parameters, fragments, and trailing slashes; sort query parameters. A vendor contributes its best rank once per canonical URL.
- Rank is reciprocal rank fusion with `k = 60`. Ties break on `found_by`, then `best_rank`, then canonical URL. Freshness is a request filter for vendors that support it, not an implicit date decay.
- The merged list is capped by `limit`; `truncated` and `total_merged` report the uncapped count.
- Each vendor report includes `status` (`ok`, `timeout`, `error`, `skipped_budget`, `skipped_unconfigured`), result count, latency, estimated cost, and an error code when applicable.
- Costs are estimates, not vendor invoices. A report with no successful vendor sets `all_failed`.

### Cache

- The cache key is the effective execution plan: normalized query, sorted selected vendors, max per vendor, freshness, mode, limit, and cache schema version.
- Only complete successful aggregates are written. A timeout or error prevents a write. Successful empty results are cacheable.
- The default TTL is 15 minutes. `cache: false` bypasses reads and writes. Cache hits report age, zero new estimated cost, null per-vendor latency, and `cached: true` on selected vendors. Cached latency is never replayed as current latency.
- Cache files are written atomically with restrictive permissions; corrupt or expired entries are deleted and treated as misses.

### Page fetching

- `fetchPages(urls)` accepts at most 20 HTTP(S) URLs. Loopback, private, link-local, multicast, reserved, documentation, metadata, IPv4-mapped IPv6, and NAT64-mapped private destinations are blocked by default.
- Every resolved address is checked; the chosen address is pinned into the connection. Redirects are validated at every hop and capped at five.
- Embedded URL credentials and non-HTTP(S) schemes are rejected.
- Per-page and aggregate character caps bound the response; the default per-URL timeout is 15,000 ms. Compressed bodies are decompressed with a byte cap.
- `WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1` is the only opt-in for private targets; it is not a per-call CLI or MCP argument.

### Configuration resolution

- The CLI, MCP server, and SDK share one resolver: process environment, nearest `.env` walking up from cwd, the OS keychain (vendor keys only), `~/.config/wide-search/config.json`, then default. Process environment wins.
- `loadConfig()` asks the keychain (service `wide-search`, entries named by env var) only for keys env and `.env` did not supply, through `Bun.secrets`. A store failure sets `keychain.status` to `unavailable` and never fails the call; `WIDE_SEARCH_KEYCHAIN=0` sets it to `disabled`. `resolveConfig()` stays synchronous and does not read the keychain unless given `keychainValues`.
- The CLI gets the process environment from its shell, `op run`, or CI, and finds a project `.env` by walking up from the directory where it runs.
- The MCP server gets the process environment from the host's `env` block and inherited env. Its cwd is host-controlled, so a project `.env` is only found when the host launches inside that project. The reliable MCP paths are the keychain (no `env` block needed), the host `env`, the user config, or an `op run` wrapper.
- A credential value that is blank after trimming, starts with `#`, starts with `op://`, or is an unexpanded `$NAME` / `${NAME}` reference is ignored in every source (env, `.env`, keychain, user config), so it neither configures a vendor nor shadows a lower-precedence source; the keychain is still asked for that key. When no usable value remains and one was ignored, the credential source is `ignored:<source> (<reason>)`. Usable values are trimmed. A `.env` value that starts with `#` (`KEY= # comment`) parses as empty.
- `wide-search config show` is the CLI diagnostic and reports winning sources with keys as set/missing. `list_vendors` is the MCP diagnostic. Both `search` and `search_wide` report per-vendor configuration gaps in `vendors[]`.
- `.env` files, user-config `keys`, and literal MCP host `env` values are plaintext at rest. The OS keychain and `op run --env-file=<op-reference-template>` are the supported no-plaintext setups for both surfaces; the E2E tests use `op inject` in memory.

### Credential management

- `wide-search auth set <vendor>` stores a vendor's keys in the keychain. On a TTY it prompts with hidden input for each key; `--stdin` reads one key from stdin and needs `--key` for a two-key vendor (DataForSEO). Without a TTY and without `--stdin` it exits 2. It never accepts a key as an argument. `--dry-run` validates without writing. Output reports `stored`/`would_store` per key and `shadowed_by` when env or `.env` still overrides the stored value.
- `wide-search auth list` reports each credential key's keychain state (`set`, `missing`, or `unknown` when the store is unavailable) and active source, never values.
- `wide-search auth delete <vendor>` removes keychain entries, reports `deleted` or `not_found`, requires `--yes`, and supports `--dry-run`.
- `wide-search auth migrate` stores keys whose active source is a `.env` file or the user config, skips keys already in the keychain unless `--overwrite`, ignores process-environment keys, supports `--dry-run`, and lists the files to clean in `clean_up`. It does not edit files.
- The MCP server has no tool that writes or deletes secrets.

### Surfaces

- The CLI exposes `search`, `fetch`, `vendors`, `auth set|list|delete|migrate`, `config show`, `cache clear|stats`, `agent-context`, and `feedback`.
- The MCP server exposes `search_wide`, `fetch_pages`, and `list_vendors`.
- `agent-context` and `wide-search-cli/SKILL.md` are derived from the live Stricli route tree.

## Acceptance criteria

- Adapters map each vendor's response into normalized rows and preserve the documented limits (`packages/sdk/tests/adapters.test.ts`).
- Canonicalization strips tracking parameters, `www`, fragments, and trailing slashes while preserving meaningful query parameters (`packages/sdk/tests/canonical.test.ts`).
- Reciprocal rank fusion dedupes by canonical URL, counts a vendor once per page, rewards consensus, and applies the limit (`packages/sdk/tests/rank.test.ts`).
- The engine merges overlapping results, selects vendors cheapest-first, rejects a zero budget, returns partial results, marks all-failed reports, reports unconfigured vendors, caches only complete success, and times out a slow vendor without blocking others (`packages/sdk/tests/engine.test.ts`).
- The cache writes/reads, expires, tolerates corruption, respects TTL zero, clears, and reports stats (`packages/sdk/tests/cache.test.ts`).
- Config precedence, `.env` walk-up, config-file credentials, redaction, unknown-vendor rejection, `.env` comment parsing, and ignoring blank/placeholder credentials with fall-through hold (`packages/sdk/tests/config.test.ts`); a placeholder key never reaches its adapter (`packages/sdk/tests/engine.test.ts`).
- Keychain credentials rank below env and `.env` and above the config file, are looked up only when missing or a placeholder, can be disabled, and an unavailable store does not fail resolution (`packages/sdk/tests/secrets.test.ts`).
- `auth` set/list/delete/migrate store trimmed values, honor `--dry-run`, flag shadowed keys, never emit values, skip existing keys on migrate, and leave env keys alone (`packages/cli/tests/auth.test.ts`); the CLI refuses `auth set` without a TTY or `--stdin`, refuses `--stdin` for a two-key vendor without `--key`, and requires `--yes` for `auth delete` (`packages/cli/tests/cli.e2e.test.ts`).
- HTML extraction and SSRF address checks hold; page fetching blocks private targets by default, follows redirects, decompresses gzip, truncates oversized bodies, and enforces the aggregate cap (`packages/sdk/tests/fetch.test.ts`).
- The CLI emits agent context, lists nine vendors with no credentials, exits 3 on no configured vendor, and rejects two format flags (`packages/cli/tests/cli.e2e.test.ts`).
- The MCP server registers the three tools with read-only annotations and bounded JSON text output, and a stdio client can list tools and call `list_vendors` (`packages/mcp/src/tools/register.test.ts`, `packages/mcp/src/tools/stdio.e2e.test.ts`).
- The opt-in live E2E suite verifies the five 1Password-backed adapters (Exa, Tavily, Parallel, Firecrawl, TinyFish) through both the CLI and a real MCP stdio client, with keys injected in memory by `op inject` and never written to disk (`packages/cli/tests/op.e2e.test.ts`, `packages/mcp/tests/op.e2e.test.ts`).

## Non-goals

- Deep research synthesis, answer generation, or a prose report.
- Crawling beyond the URLs the caller supplies.
- Profiles, a jobs ledger, self-upgrade, webhook delivery, or raw vendor payload retention.
- Treating `found_by` as independent corroboration; vendors share sources and indexes.
- Claiming estimates are invoices.

## Constraints

- Bun workspace; TypeScript strict with `noUncheckedIndexedAccess`.
- Node 20+ for the built SDK/CLI/MCP.
- Vendor keys are optional individually; at least one complete credential set is required for a search.
- DataForSEO and Ollama Cloud do not support freshness filtering.
- Per-vendor result caps: Exa 100, Tavily 20, Parallel 20, Perplexity 20, DataForSEO 100, Z.AI 50, Ollama 10, Firecrawl 100, TinyFish 10.
- The default per-call budget is $0.05.

## Decisions

- [0001: Keep docs and decisions in the repo](../decisions/0001-keep-docs-and-decisions-in-the-repo.md)
- [0002: Normalize inside adapters and rank with plain RRF](../decisions/0002-result-schema-and-ranking.md)
- [0003: Select vendors cheapest-first against an estimate budget](../decisions/0003-budget-semantics.md)
- [0004: Cache only complete successful aggregates](../decisions/0004-cache-policy.md)
- [0005: Guard page fetching against SSRF by default](../decisions/0005-fetch-ssrf-posture.md)
- [0006: Inject E2E vendor keys in memory with op inject](../decisions/0006-op-inject-e2e-secrets.md)
- [0007: Store vendor keys in the OS keychain with Bun.secrets](../decisions/0007-os-keychain-credential-store.md)
