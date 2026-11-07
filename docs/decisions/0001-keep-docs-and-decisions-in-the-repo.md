---
title: "0001: Keep docs and decisions in the repo"
description: Durable project docs live in docs/ as Starlight-compatible Markdown, strong decisions get records, and commits carry code, tests, and docs together.
status: accepted
date: 2026-11-07
decision-makers: "Spenser Hale and DeepSeek V4.1 Flash (drafting agent)"
---

## Context

Decisions, specs, and plans that live in chat history or in someone's head get lost, and coding agents drift from intent they cannot read. This repo is a new toolkit with a clean slate, so the docs structure can be chosen before the first feature ships rather than retrofitted around an existing wiki or docs site.

## Options considered

1. **Markdown in the repo**: versioned with the code, readable by every agent, reviewed in the same pull request as the change.
2. **An external wiki or tracker** (Notion, Confluence, issue threads): richer editing for non-engineers, but it drifts from the code and agents cannot see it without extra tooling.
3. **A docs framework from day one**: a rendered site immediately, at the cost of tooling before there is content.

## Decision

We keep durable docs in the repo as Markdown with Starlight-compatible frontmatter: living feature specs in `docs/specs/`, decision records in `docs/decisions/`, change plans in `docs/plans/`, product docs in `docs/product/`, and engineering guides in `docs/guides/` as each domain gets real policy. A Starlight site can render these files later without rewriting them.

Every commit is atomic: the code, its tests, and the docs it changes land together. Strong decisions get a record in `docs/decisions/`; records are superseded, never rewritten.

The owner chose the recommended defaults:

- **Structure**: default (`AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`, and `docs/` with product, specs, decisions, plans, and guides).
- **Viewable site**: Markdown only, with Starlight-compatible frontmatter so a site can be added later.
- **Product docs**: vision only; no pricing page because the toolkit has no commercial plans yet.
- **Changelog**: `CHANGELOG.md` by hand in Keep a Changelog format.

## Consequences

- Agents read the relevant spec and decisions before changing behavior, and reviewers see doc changes next to code changes.
- Updating a spec or writing a decision record is part of each change, which costs a few minutes per change.
- Specs describe current behavior only; planned behavior lives in plans until it ships.
- A rendered site is a later opt-in, not a blocker for shipping the toolkit.

## Revisit when

People who do not work in the repo need to edit docs directly, or the structure stops matching how work is planned.
