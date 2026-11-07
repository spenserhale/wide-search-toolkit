---
title: "0006: Inject E2E vendor keys in memory with op inject"
description: Live end-to-end tests use 1Password references rendered by op inject into the test process memory; rendered keys are never written to disk or printed.
status: accepted
date: 2026-11-07
decision-makers: "Spenser Hale and DeepSeek V4.1 Flash (drafting agent)"
---

## Context

The five real adapters we want to verify — Exa, Tavily, Parallel, Firecrawl, and TinyFish — each need a vendor API key. A normal `.env` or CI secret store would put those keys in plaintext somewhere the repo can reach, and a test that logs a request or a report could leak them. We still need a repeatable live check that proves the adapters, not just mocked fixtures.

## Options considered

1. **Plaintext `.env` committed or generated**: simple, but the key exists on disk and can be copied into a commit, cache, or log.
2. **CI secret store only**: good for CI, but does not help a local live run and still requires a copy of the value in the CI environment.
3. **`op inject` into a temporary file**: keeps keys out of the repo, but the rendered file is plaintext at rest until deleted.
4. **`op inject` to stdout, parsed in memory, passed to the child process environment**: the key exists only in process memory and the child environment for the duration of the test.

## Decision

We use option 4. `tests/e2e/op.env.tpl` contains only `op://Private/<item>/default` references, never literal keys. The test helper runs `op inject -i <template>` and parses stdout into an in-memory object. It passes that object to the CLI or MCP child process environment and never writes a rendered file, cache entry, fixture, or log line.

The live tests are opt-in: they skip unless `WIDE_SEARCH_OP_E2E=1`. Failure messages name the key or vendor but never include a value. The helper deliberately omits `op inject` stdout from error messages because it may contain secrets.

## Consequences

- The keys are not stored in plaintext in the repo, on disk, or in CI logs.
- A local run requires the 1Password CLI, an unlocked vault, and the item names in the template.
- CI does not run the live tests by default; adding a 1Password service account is a separate decision.
- The template is a durable, reviewable list of which vendor credentials the E2E suite expects.
- Test output can still show vendor error messages, but not the keys themselves.

## Revisit when

CI needs live E2E runs and a 1Password service account or another secret broker is approved, or the item names/fields change.

## Links

- Spec: [Wide search](../specs/wide-search.md)
- Plan: [Firecrawl, TinyFish, and 1Password-backed E2E](../plans/2026-11-07-op-inject-e2e.md)
