# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-11-10

### Fixed

- Blank, commented, `op://`, and unexpanded `$NAME` / `${NAME}` credential values no longer count as configured, so the vendor is skipped instead of failing with HTTP 401. A real key in a lower-precedence source still wins, `config show` / `auth list` report `ignored:<source> (<reason>)`, and `.env` lines like `KEY= # paste here` now parse as empty.

## [0.2.0] - 2026-11-09

### Added

- Configuration guide covering the shared resolver, CLI vs MCP environment setup, plaintext trade-offs, `op run` templates, and MCP host diagnostics.
- OS keychain credential storage via `Bun.secrets` (macOS Keychain, Linux libsecret, Windows Credential Manager). The resolver order is now env > `.env` > keychain > user config > default; the keychain is only queried for missing keys, and `WIDE_SEARCH_KEYCHAIN=0` disables it.
- `wide-search auth set|list|delete|migrate`: store keys with a hidden prompt or `--stdin`, list keychain state and active source, delete with `--yes`, and move plaintext `.env` / config-file keys into the keychain. All mutations support `--dry-run`.
- The MCP server reads keychain keys, so host configs no longer need an `env` block with literal keys.
- SDK `loadConfig()` (async, keychain-aware) and `SecretStore` / `bunSecretStore()` exports; `config show` reports `keychain` status and a `keychain` credential source.

### Changed

- `searchWide()` without an explicit `config`, and every CLI command and MCP tool, now resolve configuration with `loadConfig()` instead of `resolveConfig()`.

## [0.1.0] - 2026-11-07

### Added

- SDK with a vendor adapter contract for Exa, Tavily, Parallel, Perplexity, DataForSEO, Z.AI, Ollama Cloud, Firecrawl, and TinyFish.
- Parallel fan-out with per-vendor timeouts, partial results, cheap-first budget selection, and per-vendor status/latency/cost reports.
- Canonical-URL dedupe, reciprocal rank fusion (k = 60), and deterministic tie-breaking.
- Disk cache for complete successful aggregates with a 15-minute default TTL, atomic writes, and corrupt-entry tolerance.
- `fetchPages()` with HTTP(S)-only fetching, private-network blocking, DNS pinning, redirect validation, compression and size caps.
- Agent-native Stricli CLI: `search`, `fetch`, `vendors`, `config show`, `cache clear|stats`, `agent-context`, and local `feedback`.
- FastMCP stdio server with `search_wide`, `fetch_pages`, and `list_vendors`.
- Generated `wide-search-cli/SKILL.md` and live-tree `agent-context`.
- Opt-in live E2E tests for Exa, Tavily, Parallel, Firecrawl, and TinyFish through both the CLI and MCP, using `op inject` to keep keys out of the repo and off disk.
- Docs structure: vision, spec, decisions, plan, and vendor/security/testing guides.
