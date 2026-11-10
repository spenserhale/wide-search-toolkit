---
title: "Plan: OS keychain credentials and auth commands"
description: "Store vendor keys in the OS keychain via Bun.secrets, add `wide-search auth set|list|delete|migrate`, and resolve keychain keys in the CLI and MCP server."
status: done
date: 2026-11-09
size: bounded
specs: ["wide-search"]
---

## Intent

Every persistent key setup except `op run` is plaintext at rest, and MCP hosts push users toward literal keys in the host config. Users should be able to enter a key once, without echo, have it land in the macOS Keychain (or the Linux/Windows equivalent), and have both the CLI and MCP server pick it up with no `env` block.

## Acceptance criteria

- `resolveConfig()` with `keychainValues` resolves a key from the keychain when env and `.env` are empty, labels the source `keychain`, and still lets env and `.env` win and the config file lose.
- `loadConfig()` queries the secret store only for keys env and `.env` did not supply, reports `keychain.status` as `ok`, `disabled` (`WIDE_SEARCH_KEYCHAIN=0`), or `unavailable` (store threw), and never fails a search because the store is unavailable.
- `wide-search auth set <vendor>` prompts with hidden input on a TTY; `--stdin` reads one value from stdin; it refuses a non-TTY without `--stdin`, refuses `--stdin` for a multi-key vendor without `--key`, supports `--dry-run`, and never takes the secret as an argument.
- `wide-search auth list` shows every credential key with keychain set/missing and the active source, never values.
- `wide-search auth delete <vendor>` requires `--yes` and supports `--dry-run`.
- `wide-search auth migrate` copies keys whose active source is a `.env` file or the user config into the keychain, skips keys already in the keychain unless `--overwrite`, supports `--dry-run`, and lists the files to clean up. It does not edit files.
- CLI, MCP tools, and the `searchWide()` default use `loadConfig()`.
- Guides, READMEs, spec, changelog, and the generated skill describe interactive and non-interactive setup and the MCP no-`env` setup.

## Non-goals

- MCP tools that write or delete secrets.
- Editing or deleting `.env` / config files during `migrate`.
- Multiple keychain profiles or a custom service name.
- A plaintext fallback store when no keychain exists; env, `.env`, and the config file already cover that.
- Node runtime support for keychain lookups.

## Design

- `packages/sdk/src/secrets.ts`: `SecretStore` interface (`get`, `set`, `delete` by name), `bunSecretStore()` over `Bun.secrets` with service `wide-search`, `CREDENTIAL_KEYS` (primary env names), `vendorForCredentialKey()`, and `readKeychainValues()` which reads in parallel.
- `packages/sdk/src/config.ts`: `ResolveConfigOptions.keychainValues`; credential lookup becomes env/.env > keychain > config file. `ResolvedConfig.keychain` carries status. New async `loadConfig({ ...options, secretStore })`.
- CLI: `auth` route map with `set`, `list`, `delete`, `migrate`. Logic in `packages/cli/src/lib/auth.ts` takes an injected `SecretStore` so it is unit-testable without touching the real keychain; commands are thin wrappers. `packages/cli/src/lib/prompt.ts` does hidden TTY input on stderr.
- Tests: SDK config tests with an in-memory store; CLI unit tests for auth logic with an in-memory store; CLI e2e tests for the validation paths that fail before any store access.

Runner-up: a native keyring package so Node works too. Lost on an extra native dependency for a runtime we do not use. See decision 0007.

## Spec delta

- `docs/specs/wide-search.md`: MODIFIED configuration resolution to include the OS keychain; ADDED `auth` commands to the CLI surface; ADDED acceptance criteria for keychain resolution and auth commands.

## Docs impact

- `docs/guides/configuration.md`: keychain option, interactive and non-interactive setup, MCP setup without `env`, diagnostics.
- `docs/guides/security.md`: keychain storage and the no-argv rule for secrets.
- `README.md`, `packages/cli/README.md`, `packages/mcp/README.md`, `packages/sdk/README.md`: setup sections.
- `.env.example`: point at `wide-search auth set`.
- `CHANGELOG.md`: Unreleased entries, then 0.2.0.
- `wide-search-cli/SKILL.md`: regenerate.

## Decisions

- [0007: Store vendor keys in the OS keychain with Bun.secrets](../decisions/0007-os-keychain-credential-store.md)

## Tasks

1. Plan and decision record. Commit: `docs: plan OS keychain credentials`.
2. SDK secret store, `loadConfig`, callers, CLI `auth` commands, tests, docs, skill. Commit: `feat(auth): store vendor keys in the OS keychain`.
3. Release 0.2.0: bump package versions, `CLI_VERSION`, default user agent, changelog section, tag, GitHub release. Commit: `chore(release): 0.2.0`.

## Rulings

- [config] `.env` beats the keychain — a project `.env` is an explicit per-project override, same as dotenv semantics — cost if wrong: low, users reorder by deleting the `.env` line.
- [auth set] No secret as a positional or flag value — argv shows up in shell history and `ps` — cost if wrong: low.
- [auth set] Non-TTY without `--stdin` is an error, not an implicit stdin read — keeps agent calls explicit and avoids hanging on an open stdin — cost if wrong: low.
- [auth] Credential entries are named by env var (`EXA_API_KEY`) so the keychain, `.env`, and host env share one vocabulary — cost if wrong: medium, renaming later needs a migration.
- [Z.AI] Only `ZAI_API_KEY` is stored; the `Z_AI_API_KEY` alias stays env-only — cost if wrong: low.
