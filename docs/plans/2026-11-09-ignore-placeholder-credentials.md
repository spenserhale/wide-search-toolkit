---
title: "Plan: Ignore blank and placeholder credentials"
description: "Treat blank, commented, and unresolved-reference credential values as missing so the engine never calls a vendor with a placeholder key."
status: in-progress
date: 2026-11-09
size: bounded
specs: ["wide-search"]
---

## Intent

A vendor counts as configured when its key resolves to any non-empty string. Several values that are clearly not keys pass that check and get sent to the vendor, which answers HTTP 401 (`E_AUTH`) and shows up as a selected, failed vendor that the user never configured:

- `.env` line `PERPLEXITY_API_KEY= # paste key here` parses as `# paste key here`, because the parser only strips ` #` and the value was already trimmed.
- `op://Private/Perplexity/credential` left in the environment or a `.env` file when the command was not run through `op run` / `op inject`.
- `${PERPLEXITY_API_KEY}` or `$PERPLEXITY_API_KEY` from an MCP host `env` block that does not expand variables.
- Whitespace-only values.

Success: those values make the vendor `skipped_unconfigured` (with no request sent), a real key in a lower-precedence source still wins, and the diagnostics say why the value was ignored.

## Acceptance criteria

- `.env` `KEY= # comment` parses as an empty value.
- A credential value that is blank after trimming, starts with `#`, starts with `op://`, or is an unexpanded `$NAME` / `${NAME}` reference is treated as missing in every source (process env, `.env`, keychain, user config).
- An ignored value does not shadow a lower-precedence source: a placeholder in env plus a real key in the keychain resolves to the keychain key, and `loadConfig()` asks the keychain for that key.
- When every source is missing or ignored and at least one was ignored, `credentialSources[KEY]` is `ignored:<source> (<reason>)`, so `config show` and `auth list` explain it.
- Usable credential values are trimmed.
- The engine reports such a vendor as `skipped_unconfigured` and never calls its adapter.

## Non-goals

- Validating key formats per vendor (prefixes, lengths). Real but revoked or wrong keys still return `E_AUTH`.
- Resolving `op://` references inside the resolver (already a non-goal in the configuration plan).
- Changing non-credential settings parsing.

## Design

Add `credentialValueProblem(value)` in `packages/sdk/src/config.ts`, returning a short reason or `null`. `resolveCredentials()` walks the candidates in precedence order (each env name: process env, then `.env`; then keychain; then config file), takes the first usable trimmed value, and records the first ignored candidate's source and reason when nothing usable exists. `loadConfig()` uses the same check to decide which keys still need a keychain lookup. Fix `parseEnvFile()` so a value starting with `#` is empty.

Runner-up: reject placeholders with `E_CONFIG` and fail the call. Lost because one bad key would block every other configured vendor, and the engine already has a non-fatal `skipped_unconfigured` path for exactly this.

Tests: `packages/sdk/tests/config.test.ts` (parser, each placeholder form, fall-through, source label), `packages/sdk/tests/secrets.test.ts` (keychain looked up behind a placeholder), `packages/sdk/tests/engine.test.ts` (adapter not called).

## Spec delta

- `docs/specs/wide-search.md`: ADDED credential values that are blank, commented, `op://` references, or unexpanded `$NAME` / `${NAME}` references are ignored in every source and reported as `ignored:<source> (<reason>)`; MODIFIED test coverage list.

## Docs impact

- `docs/guides/configuration.md`: Diagnostics section mentions `ignored:` sources.
- `CHANGELOG.md`: Unreleased `Fixed` entry.

## Decisions

None; this tightens the existing resolver without changing its precedence or interface.

## Tasks

1. Resolver and parser fix, tests, spec, guide, changelog. Files: `packages/sdk/src/config.ts`, `packages/sdk/tests/config.test.ts`, `packages/sdk/tests/secrets.test.ts`, `packages/sdk/tests/engine.test.ts`, `docs/specs/wide-search.md`, `docs/guides/configuration.md`, `CHANGELOG.md`. Commit: `fix(config): ignore blank and placeholder credentials`.

## Rulings

- [resolver] Ignored values fall through to lower-precedence sources instead of blocking them — a stale placeholder should not hide a real keychain key — cost if wrong: low, a user who expected env to "unset" a key sees the keychain key used.
- [resolver] Only the first ignored candidate is reported — enough to point at the culprit — cost if wrong: low.

## Deferred

None.
