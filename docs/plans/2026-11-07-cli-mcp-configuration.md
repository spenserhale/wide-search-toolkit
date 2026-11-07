---
title: "Plan: Document CLI vs MCP environment setup"
description: Explain the shared resolver, the different process-environment bootstraps, plaintext trade-offs, and the op run path for both surfaces.
status: done
date: 2026-11-07
size: trivial
specs: ["wide-search"]
---

## Intent

The code already shared one config resolver between the CLI and MCP server, but the docs did not explain the operational difference: the CLI gets its environment from a shell and finds a project `.env` by walking up from cwd, while an MCP host supplies the environment and chooses the server's cwd. A user could configure the CLI successfully and still see an unconfigured MCP server. The user asked for this distinction to be documented.

Success: a reader can set up either surface, knows where each environment source lives, understands which files are plaintext at rest, and can use an `op run` wrapper when keys must not be persisted.

## Acceptance criteria

- A configuration guide covers the shared precedence, CLI setup, MCP setup, diagnostics, plaintext trade-offs, and `op run` templates.
- The root README, CLI README, MCP README, `AGENTS.md`, spec, and changelog point to or reflect the guide.
- The generated skill mentions the CLI/MCP cwd difference and the plaintext caveat.
- No product behavior changes.

## Non-goals

- Resolving `op://` references inside the config resolver.
- A 1Password service-account CI setup.
- Changing the precedence order or adding a new MCP config tool.

## Design

Docs-only. `docs/guides/configuration.md` owns the detailed setup and troubleshooting. The root README gets a compact CLI-vs-MCP table and an `op run` example. The package READMEs get surface-specific notes. The MCP guidance names the host `env` block, the user config, and the `op run` wrapper, and explains that the server's cwd is host-controlled. The spec adds a configuration-resolution section.

The `op run` pattern was verified with the five 1Password references before documenting it:

```bash
op run --env-file=tests/e2e/op.env.tpl -- sh -c 'printf "%s %s\n" "${EXA_API_KEY:+set}" "${TINYFISH_API_KEY:+set}"'
# set set
```

No key values were printed or written.

## Spec delta

- `docs/specs/wide-search.md`: ADDED configuration resolution and CLI/MCP bootstrap behavior.

## Docs impact

- `README.md`: compact precedence table, MCP/CLI bootstrap difference, `op run` example, guide link.
- `packages/cli/README.md`: CLI environment section and `op run` example.
- `packages/mcp/README.md`: host `env`, cwd caveat, user config, `op run` wrapper, `list_vendors` diagnostic.
- `AGENTS.md`: configuration guide in Progressive disclosure.
- `CHANGELOG.md`: Unreleased documentation entry.
- `wide-search-cli/SKILL.md`: regenerated with the CLI/MCP cwd and plaintext quirks.

## Decisions

No new decision record. This documents existing behavior and the already-accepted `op inject`/`op run` no-plaintext posture.

## Tasks

- [x] Verify `op run --env-file=tests/e2e/op.env.tpl` injects the five references without writing a file.
- [x] Smoke-test the `op run` path for the CLI (`vendors` shows five configured) and MCP (`list_vendors` shows five configured).
- [x] Write `docs/guides/configuration.md`.
- [x] Update the root and package READMEs.
- [x] Update `AGENTS.md`, the spec, and the changelog.
- [x] Add the CLI/MCP environment quirks to `agent-context` and regenerate the skill.
- [x] Document that terminal exports work for the CLI immediately but reach MCP only when the host inherits that shell.
- [x] Add a setup-options-at-a-glance table covering the MCP host `env` block, inherited terminal env, `.env`, user config, and per-call flags.

## Rulings

- [docs] `op run` is the recommended no-plaintext path for both surfaces — it injects into the child process without a rendered file — cost if wrong: low, point users back to host env/.env.
- [docs] The MCP section recommends the host `env`, user config, or `op run` wrapper, not a project `.env` — host cwd is not reliable — cost if wrong: low, a user can still set the host cwd if they control it.
- [docs] The guide calls `.env`, user-config `keys`, and MCP host `env` plaintext at rest; hiding that would undermine the security posture — cost if wrong: low.
- [docs] The MCP `op run` wrapper needs the real `HOME` or `OP_ACCOUNT` / `OP_SERVICE_ACCOUNT_TOKEN`; a stripped HOME breaks 1Password account discovery — cost if wrong: low, users see a clear “No accounts configured” error.
- [docs] Terminal exports are documented as a CLI path and a conditional MCP path, not a universal MCP path — GUI hosts usually do not inherit a shell — cost if wrong: low, `list_vendors` makes the gap visible.

## Deferred

- 1Password service-account support for headless MCP hosts.
- An MCP `config_show` tool; `list_vendors` is the current diagnostic.
