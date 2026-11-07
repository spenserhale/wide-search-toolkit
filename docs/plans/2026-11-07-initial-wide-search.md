---
title: "Plan: Initial wide-search toolkit"
description: Build the SDK, CLI, MCP server, skill, and docs for a multi-vendor wide search toolkit.
status: done
date: 2026-11-07
size: architectural
specs: ["wide-search"]
---

## Intent

A single search vendor gives a narrow, confident view of the web. The user wants one call that fans out to several vendors, shows where they agree and where they are blind, and keeps the cost and failure modes visible to an agent. The toolkit also has to follow the established repo pattern: SDK, Stricli CLI, FastMCP stdio server, and a generated skill, with the same agent-native conventions as the mature toolkits.

Success: `wide-search search "query"` returns merged, deduped, ranked results plus a per-vendor report; the same capability is available over MCP; the CLI is introspection-friendly; and the project has a durable docs structure from the first commit.

## Acceptance criteria

- Seven vendor adapters (Exa, Tavily, Parallel, Perplexity, DataForSEO, Z.AI, Ollama Cloud) parse their own responses and normalize to one row shape.
- Parallel fan-out with per-vendor timeouts returns partial results; one slow vendor does not block the rest.
- Canonical-URL dedupe and reciprocal rank fusion produce deterministic merged results.
- Cheap-first budget selection reports `skipped_budget` and `skipped_unconfigured` distinctly from `ok`.
- Only complete successful aggregates are cached; cache hits report age and zero new cost.
- `fetchPages` blocks private-network targets by default, pins DNS, validates redirects, and bounds response size.
- The CLI exposes `search`, `fetch`, `vendors`, `config show`, `cache`, `agent-context`, and `feedback`, plus the TOON/JSON/CSV/text formats and atomic `--deliver file:`.
- The MCP server exposes `search_wide`, `fetch_pages`, and `list_vendors`.
- The generated skill and `agent-context` stay in sync with the live route tree.
- `bun test` and `bun run lint` pass.

## Non-goals

- Deep-research synthesis or a prose report.
- Profiles, a jobs ledger, self-upgrade, webhook delivery, or raw vendor payload retention.
- Live-vendor calls in CI.
- A docs site; the docs are Starlight-compatible Markdown only.

## Design

The SDK is the center. `packages/sdk/src/engine.ts` owns vendor selection, execution, timeout wrapping, merge, report construction, and cache decisions. Each adapter in `packages/sdk/src/vendors/` owns one vendor's request/response translation. `canonical.ts`, `rank.ts`, `cache.ts`, and `fetch.ts` keep the cross-cutting rules separate and unit-testable.

The CLI is a Stricli route map over the SDK. `lib/introspect.ts` reads the live route tree; `agent-context` and `scripts/build-skill.ts` consume that tree, so a new flag appears in both without hand-editing. The MCP server registers three FastMCP tools with bounded Zod inputs and read-only/open-world annotations.

The design review from Kimi K3.1 Pro changed three choices: normalizing inside adapters instead of the engine, plain RRF instead of a `found_by` bonus, and SSRF protection in v0.1 instead of a deferred hardening pass. It also recommended cutting webhook delivery, profiles, jobs, self-upgrade, and raw payload retention, which this plan does.

## Spec delta

- `docs/specs/wide-search.md`: ADDED search, per-vendor reporting, canonical dedupe, RRF ranking, budget selection, cache policy, page fetching, and surface behavior.

## Docs impact

- `README.md`: install, quick start, vendor table, output formats, MCP setup, security, and v0.1 boundaries.
- `AGENTS.md` and `CLAUDE.md`: router and pointer.
- `docs/product/vision.md`: audience, problem, boundaries, success.
- `docs/decisions/0002`–`0005`: result/ranking, budget, cache, and SSRF posture.
- `docs/guides/vendors.md`, `security.md`, `testing.md`: working policies.
- `CHANGELOG.md`: 0.1.0 entry.
- `wide-search-cli/SKILL.md`: generated from the live tree.

## Decisions

- [0001: Keep docs and decisions in the repo](../decisions/0001-keep-docs-and-decisions-in-the-repo.md)
- [0002: Normalize inside adapters and rank with plain RRF](../decisions/0002-result-schema-and-ranking.md)
- [0003: Select vendors cheapest-first against an estimate budget](../decisions/0003-budget-semantics.md)
- [0004: Cache only complete successful aggregates](../decisions/0004-cache-policy.md)
- [0005: Guard page fetching against SSRF by default](../decisions/0005-fetch-ssrf-posture.md)

## Tasks

- [x] Scaffold the Bun workspace, root tsconfig, env example, and package boundaries.
- [x] Implement SDK types, errors, config, canonicalization, ranking, cache, and engine.
- [x] Implement seven vendor adapters and shared request/error mapping.
- [x] Implement safe page fetching with redirects, DNS pinning, compression, and caps.
- [x] Implement the Stricli CLI, output formats, delivery, agent context, and cache/feedback commands.
- [x] Implement the FastMCP server and three tools.
- [x] Add SDK, CLI, and MCP tests; no live vendor calls.
- [x] Generate `wide-search-cli/SKILL.md`.
- [x] Write the docs tree, decisions, plan, guides, README, and changelog.

## Rulings

- [sdk] One `SearchReport` envelope for CLI and MCP instead of separate shapes — one contract to test, one thing for an agent to learn — cost if wrong: medium, both surfaces must change together.
- [cli] `--deliver` supports stdout and atomic file writes only in v0.1 — webhook delivery needs the same SSRF guard and would be a second outbound primitive — cost if wrong: low, add it behind the guard later.
- [cli] `--text` is an explicit human layout; the default stays `toon` — agents are the primary consumer and TOON is the cheapest useful default — cost if wrong: low, change the default in `resolveFormat`.
- [sdk] Freshness is not a ranking signal — vendor date formats and missing dates would silently damage relevance — cost if wrong: medium, an explicit date sort can be added later.
- [sdk] The cache key includes the execution plan, not the raw budget — budget changes the selected vendor set, which is already in the key — cost if wrong: low, an extra key version.
- [cli] `agent-context` defaults to JSON even though the CLI defaults to TOON — introspection should be stable for programmatic callers — cost if wrong: low.

## Deferred

- Webhook delivery: needs the fetch SSRF guard and an explicit trust model.
- Profiles and a jobs ledger: not needed until a caller needs named credentials or async jobs.
- Self-upgrade: no published release or CI binary pipeline yet.
- Raw vendor payload retention: add an internal diagnostic hook only if real debugging needs it.
- Live vendor smoke tests: keep them outside CI; the adapter fixtures are the contract.
- Starlight site: the docs are ready for one, but Markdown is the source of truth.
