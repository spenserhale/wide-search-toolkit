# AGENTS.md

## Purpose

`wide-search-toolkit` gives agents and people one call that fans a query out to several independent web-search vendors, dedupes by canonical URL, ranks with reciprocal rank fusion, and reports per-vendor status, latency, and estimated cost. It ships an SDK, a Stricli CLI, a FastMCP stdio server, and a generated CLI skill.

## Quick start

```bash
bun install
bun test
bun run build
bun run lint
bun run dev:cli -- --help
bun run dev:mcp
bun run build:skill
WIDE_SEARCH_OP_E2E=1 bun run test:e2e:op   # live five-vendor check via op inject
```

The CLI reads vendor keys from the process environment, the nearest `.env` walking up from cwd, the OS keychain (`wide-search auth set`), or `~/.config/wide-search/config.json`. Tests must never touch the real keychain: inject an in-memory `SecretStore`, or set `WIDE_SEARCH_KEYCHAIN=0` for spawned processes. At least one vendor key is required for a search. `bun run lint` builds the SDK declarations first because the CLI and MCP packages import the published SDK types. The live E2E command requires an unlocked 1Password CLI and is skipped by the default test run.

## Repo layout

- `packages/sdk/src/` — types, config, errors, canonicalization, ranking, cache, fetch guards, fan-out engine, and `vendors/` adapters.
- `packages/cli/src/` — Stricli route map, commands, output/delivery helpers, and the live-tree introspector.
- `packages/mcp/src/` — FastMCP server and tool registrations.
- `wide-search-cli/SKILL.md` — generated agent skill; do not hand-edit.
- `docs/` — durable specs, decisions, plans, and guides.
- `packages/*/tests/` and `packages/sdk/tests/` — tests; no live vendor calls.

## Documentation

Durable project knowledge lives in `docs/` as Markdown with `title` and `description` frontmatter and no body H1 (Starlight-compatible). Before changing a feature's behavior, read its spec and the decisions that touch it.

| Kind | Path | Rule |
|---|---|---|
| Specs: what each feature does now | `docs/specs/<feature>.md` | Change in the same commit as the behavior; never ahead of the code |
| Decisions: why | `docs/decisions/NNNN-<title>.md` | New record for every strong decision; supersede, never rewrite |
| Plans: one change, designed and tasked | `docs/plans/YYYY-MM-DD-<topic>.md` | Write and commit before the code |
| Product | `docs/product/vision.md` | Read before scoping a change |
| Guides | `docs/guides/<topic>.md` | See Progressive disclosure |
| Changelog | `CHANGELOG.md` | Add an `## [Unreleased]` line in the same commit as any user-visible change |

Templates: `_template.md` in `docs/specs/`, `docs/decisions/`, and `docs/plans/`. A decision is strong when it is hard to reverse, adds a dependency or a pattern others will copy, changes a public interface or data model, touches security, privacy, or pricing, or departs from an accepted decision. Smaller calls go in the plan's `## Rulings`. Never deviate silently from a spec or an accepted decision.

## Progressive disclosure

Before editing, check whether the task touches one of these areas and read the guide first:

- Vendor adapter contracts, costs, or a new vendor: `docs/guides/vendors.md`
- CLI vs MCP environment setup, `.env`, OS keychain / `auth` commands, user config, or `op run`: `docs/guides/configuration.md`
- Fetching, SSRF, secrets, or delivery: `docs/guides/security.md`
- Tests, fixtures, or live-vs-mocked boundaries: `docs/guides/testing.md`
- TODO Release (`docs/guides/release.md`): changesets, npm publishing, and standalone binaries; write it when the toolkit gets its first release workflow.

## Skills

- `wide-search-cli/SKILL.md` — the generated reference for driving the CLI. Regenerate with `bun run build:skill` after any command or flag change.

## Coding standards

1. **YAGNI**: Don't build it until you need it
2. **DRY**: Extract patterns after second duplication, not before
3. **Fail Fast**: Explicit errors beat silent failures
4. **Simple First**: Write the obvious solution, optimize only if needed
5. **Delete Aggressively**: Less code = fewer bugs
6. **Semantic Naming**: Always name variables, parameters, and API endpoints with verbose, self-documenting names that optimize for comprehension by both humans and LLMs, not brevity (e.g., `wait_until_obs_is_saved=true` vs `wait=true`)

## Commits

A change starts with its plan, committed before any code together with the decision records made while designing. After that, one commit is one complete change: the code, its tests, and every doc it changes (spec, guide, changelog line, decision record). Conventional Commits subject (`feat(scope): ...`); the body says why and names the docs it touched (`Spec:`, `Decision:`, `Plan:`).

## Done criteria

Before finishing any task:

- Run `bun test` and `bun run lint` and fix failures before declaring done.
- Behavior changed: the spec, changelog, and any affected guide changed in the same commit.
- A strong decision was made: its decision record exists.
- If a check was skipped, say why; flag risky assumptions explicitly.
- Regenerate `wide-search-cli/SKILL.md` with `bun run build:skill` when commands or flags change.
