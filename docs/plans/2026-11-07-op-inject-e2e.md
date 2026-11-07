---
title: "Plan: Firecrawl, TinyFish, and 1Password-backed E2E"
description: Add Firecrawl and TinyFish adapters and verify the five real adapters through the CLI and MCP without storing keys in plaintext.
status: done
date: 2026-11-07
size: bounded
specs: ["wide-search"]
---

## Intent

The user has Exa, Tavily, Parallel, Firecrawl, and TinyFish API keys in 1Password. The toolkit supported the first three but not the last two, and the existing tests only proved mocked adapter behavior. We need a repeatable live check that all five adapters work through both the CLI and the MCP server, with no plaintext keys committed, written, or logged.

Success: `WIDE_SEARCH_OP_E2E=1 bun run test:e2e:op` passes; each of the five vendor reports says `ok` with at least one result in both the CLI and MCP paths.

## Acceptance criteria

- Firecrawl and TinyFish are first-class adapters with catalog entries, credentials, request/response parsing, freshness support, limits, and cost estimates.
- Mocked adapter tests cover both new vendors and their request bodies/headers.
- The CLI live test searches exactly the five vendors and asserts five `ok` reports with results.
- The MCP live test does the same through a real stdio client.
- `tests/e2e/op.env.tpl` contains only `op://` references.
- The test helper uses `op inject` stdout in memory; no rendered file, cache entry, or log line contains a key.
- The live tests skip by default and never run in CI without `WIDE_SEARCH_OP_E2E=1`.

## Non-goals

- Adding Firecrawl scrape-content or TinyFish fetch/agent behavior.
- A 1Password service-account CI integration.
- Storing keys in the repo, a fixture, a snapshot, or a job log.
- Testing every vendor on every query; the live test uses one stable query.

## Design

Firecrawl uses `POST https://api.firecrawl.dev/v2/search` with a Bearer key, `sources: ["web"]`, `limit`, and `tbs` for freshness. TinyFish uses `GET https://api.search.tinyfish.ai` with `X-API-Key`, `query`, `domain_type=web`, and `recency_minutes` for freshness. Both normalize through the existing adapter contract.

The E2E helper reads `tests/e2e/op.env.tpl`, runs `op inject -i` with stdout captured, parses `KEY=value` lines in memory, and validates that all five keys are present. The CLI test spawns the source `bin.ts` with that env; the MCP test starts the FastMCP server through `StdioClientTransport` with the same env. Both assert per-vendor status and result counts, not just the merged list.

The runner is opt-in through `WIDE_SEARCH_OP_E2E=1`. `bun test` and CI skip the live files. The failure path never prints the injected values.

## Spec delta

- `docs/specs/wide-search.md`: ADDED Firecrawl and TinyFish to the supported vendor caps; ADDED the opt-in live E2E acceptance criterion.

## Docs impact

- `README.md`: vendor table, E2E run instructions, test-count language.
- `CHANGELOG.md`: two adapters and the 1Password-backed E2E suite.
- `AGENTS.md`: live E2E command.
- `docs/guides/testing.md`: E2E policy and run command.
- `docs/guides/security.md`: in-memory secret injection policy.
- `docs/guides/vendors.md`: Firecrawl and TinyFish notes.
- `tests/e2e/README.md`: operator instructions.

## Decisions

- [0006: Inject E2E vendor keys in memory with op inject](../decisions/0006-op-inject-e2e-secrets.md)

## Tasks

- [x] Add Firecrawl and TinyFish to the vendor vocabulary, catalog, config, and adapters.
- [x] Add mocked adapter tests for both.
- [x] Add the `op inject` template and in-memory helper.
- [x] Add the CLI live E2E test and `test:e2e:op` script.
- [x] Add the MCP live E2E test through `StdioClientTransport`.
- [x] Run `WIDE_SEARCH_OP_E2E=1 bun run test:e2e:op` against the five real keys.
- [x] Update the spec, changelog, README, and guides.

## Rulings

- [e2e] Use one stable query (`TypeScript programming language`) with `max_per_vendor=3`, `mode=fast`, `budget_usd=1`, `limit=20`, `no_cache=true` — exercises every adapter with a small, bounded call — cost if wrong: low, adjust the query or limits.
- [e2e] Test the CLI and MCP separately instead of only one — the two consumers can drift in env/argument handling — cost if wrong: low, the shared SDK still covers most logic.
- [e2e] Pass the injected env only to the child, not to the test runner's own process environment — reduces accidental exposure in unrelated subprocesses — cost if wrong: low.
- [sdk] Firecrawl requests `sources: ["web"]` and does not request `scrapeOptions` — snippets are enough for a fan-out and scraped content is expensive — cost if wrong: low, add scrape options later.
- [sdk] TinyFish returns 10 results per page and exposes no limit parameter; the adapter caps at 10 rather than paginating — one page is enough for fan-out — cost if wrong: low, add pagination later.

## Deferred

- Firecrawl scrape-content and TinyFish fetch/agent adapters.
- TinyFish pagination beyond page 0.
- CI live E2E via a 1Password service account or another approved broker.
- A cached 1Password session for remote/headless runs.
