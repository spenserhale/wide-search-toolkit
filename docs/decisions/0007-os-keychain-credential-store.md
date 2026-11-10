---
title: "0007: Store vendor keys in the OS keychain with Bun.secrets"
description: "Vendor keys can live in the OS credential store via Bun.secrets, resolved after env and .env and before the user config file."
status: accepted
date: 2026-11-09
decision-makers: "Spenser Hale"
---

## Context

Before this change, every persistent way to give `wide-search` a vendor key except `op run` was plaintext at rest: a project `.env`, `keys` in `~/.config/wide-search/config.json`, or literal values in an MCP host `env` block. `op run` works but requires 1Password. The MCP case is the worst one: GUI hosts do not inherit the shell, so the usual fix is to paste keys into the host config file.

Other CLIs solve this with the OS credential store: `gh` keeps its token in the system keyring and falls back to a plaintext file only when no keyring exists, and Clerk's CLI does the same with a `chmod 600` fallback. Bun 1.3+ ships `Bun.secrets`, which wraps macOS Keychain Services, Linux libsecret, and Windows Credential Manager with no native dependency. Both the CLI and the MCP server already run on Bun (`#!/usr/bin/env bun`).

## Options considered

1. **`Bun.secrets`**: built in, cross-platform, no install step, async only. Only works when the process runs on Bun.
2. **`@napi-rs/keyring` or `keytar`**: work on Node too, but add a native dependency with per-platform optional packages; `keytar` is archived. The Clerk CLI hit missing bindings when `bun install` skipped non-matching optional deps.
3. **Shell out to `security`**: no dependency, but macOS only and leaks argument values to `ps` on `add-generic-password -w <value>`.
4. **Document `op run` only**: no code, but it leaves non-1Password users with plaintext.

## Decision

We will store vendor keys with `Bun.secrets` under service `wide-search`, one entry per env-var name (for example `EXA_API_KEY`), because it is built into the runtime we already require and covers all three desktop OSes without a native dependency.

Resolution order for credentials becomes:

```
process environment > nearest .env > OS keychain > user config file
```

Explicit, per-process or per-project values still win, so `op run`, CI env, and project overrides keep working unchanged. The keychain beats the user config file because it is the safer machine-wide store.

The resolver reads the keychain only for keys that env and `.env` did not supply, and treats any store error (no Bun, no Linux secret service, locked keychain) as "keychain unavailable" rather than a fatal error, so headless and CI environments behave as before. `WIDE_SEARCH_KEYCHAIN=0` turns the lookup off.

Writes happen only through the CLI `auth` commands. The MCP server reads the keychain but exposes no tool that writes secrets.

## Consequences

- MCP host configs no longer need an `env` block with literal keys.
- `resolveConfig()` stays synchronous for callers that pass everything in; a new async `loadConfig()` adds the keychain lookup, and the CLI, MCP server, and `searchWide()` default use it. SDK consumers running on Node get the old behavior.
- macOS may show a keychain access prompt the first time a different binary reads an entry (for example after a Bun upgrade or from a compiled binary).
- The keychain protects keys at rest, not from code already running as the user after access is granted.

## Revisit when

- The CLI or MCP server needs to run on Node, or ships as a `bun build --compile` binary where per-build keychain prompts become a problem.
- Users need several keychain profiles (separate services per account).

## Links

- Spec: [wide-search](../specs/wide-search.md)
- Plan: [OS keychain credentials](../plans/2026-11-09-os-keychain-credentials.md)
- Guide: [Configuration](../guides/configuration.md)
