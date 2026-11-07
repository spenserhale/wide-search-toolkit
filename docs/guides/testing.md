---
title: "Testing"
description: Read this when adding tests, changing test fixtures, or deciding whether a check belongs in CI or a live smoke run.
---

## Purpose

Read this guide when adding a test, changing a fake adapter or fetch fixture, or deciding whether a vendor check should run in CI.

## Policy

- **No live vendor calls in CI or the default test run.** Adapter tests mock `globalThis.fetch`; engine tests inject fake adapters; page-fetch tests use a local HTTP server. A live smoke run is a separate, explicit command.
- **Test the contract, not the implementation.** Assert the normalized row, the request body/headers that matter, the error code, and the report status. Do not assert incidental latency or cost values.
- **Keep the merge tests deterministic.** Use fixed ranks, fixed URLs, and fixed budgets. A test that depends on wall-clock time or vendor order is a flaky test.
- **Exercise failure shapes.** For every adapter, cover a successful response and at least one of 401, 429, 5xx, malformed JSON, or a timeout. The engine tests cover partial failure, all-failed, unconfigured, budget skips, cache hit, and timeout.
- **Use a fake clock for cache tests.** Pass `now` to `SearchCache` and the engine instead of sleeping.
- **Test the guard where it lives.** `isPrivateAddress` and `isBlockedHostname` are unit tests; `fetchPages` uses a local server with `allowPrivateHosts: true` for the happy path and without it for the block.
- **Test the generated surfaces.** The CLI e2e test runs `agent-context` and `vendors` with no credentials; the MCP test registers the three tools against a fake server.
- **Update the spec's acceptance criteria** when a test is added or renamed, so the spec stays checkable.

## Live 1Password E2E

The five real adapters (Exa, Tavily, Parallel, Firecrawl, TinyFish) have an opt-in live suite. It skips unless `WIDE_SEARCH_OP_E2E=1`, so normal `bun test` and CI never call 1Password or a vendor.

```bash
eval "$(op signin)"
WIDE_SEARCH_OP_E2E=1 bun run test:e2e:op
```

- `tests/e2e/op.env.tpl` contains only `op://` references.
- `tests/e2e/op.ts` runs `op inject -i`, parses stdout in memory, and passes the values to the child CLI/MCP environment.
- No rendered file, cache entry, fixture, or log line contains a key. Do not add one.
- The CLI test lives in `packages/cli/tests/op.e2e.test.ts`; the MCP test lives in `packages/mcp/tests/op.e2e.test.ts`.
- Both assert per-vendor `status: "ok"` and `results > 0`, not just a merged result count.

## Commands

```bash
bun test                       # all SDK, CLI, and MCP tests
bun test packages/sdk          # SDK units
bun test packages/cli          # CLI units + e2e
bun test packages/mcp          # MCP registration
bun run lint                   # tsc --noEmit in every package (builds SDK types first)
bun run build:skill            # regenerate wide-search-cli/SKILL.md
```

## Test layout

- `packages/sdk/tests/` — canonicalization, ranking, engine, cache, config, fetch, adapter mocks, and shared helpers.
- `packages/cli/tests/` — output/format helpers and an end-to-end CLI test that spawns the source entrypoint.
- `packages/mcp/src/tools/register.test.ts` — tool names, annotations, and output schemas against a fake FastMCP server.

## Related docs

- [Spec](../specs/wide-search.md)
- [Vendor guide](vendors.md)
- [Security guide](security.md)
