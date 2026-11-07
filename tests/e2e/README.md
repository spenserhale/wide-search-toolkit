# 1Password-backed end-to-end tests

These tests verify that the **real** Exa, Tavily, Parallel, Firecrawl, and TinyFish adapters answer through both the CLI and the MCP server.

## Why there are no keys in the repo

`tests/e2e/op.env.tpl` contains only 1Password secret references:

```
EXA_API_KEY=op://Private/Exa/default
```

The test helper runs `op inject -i tests/e2e/op.env.tpl` and keeps the rendered values **in memory**. It passes them to the child CLI/MCP process environment; it never writes a rendered `.env`, cache, log, or fixture. The test failure messages never print the rendered values.

## Run

Unlock 1Password and make sure the CLI is signed in:

```bash
eval "$(op signin)"
WIDE_SEARCH_OP_E2E=1 bun run test:e2e:op
```

Or run one side:

```bash
WIDE_SEARCH_OP_E2E=1 bun test packages/cli/tests/op.e2e.test.ts
WIDE_SEARCH_OP_E2E=1 bun test packages/mcp/tests/op.e2e.test.ts
```

Without `WIDE_SEARCH_OP_E2E=1` both files skip, so `bun test` and CI never touch live vendor APIs or 1Password.

## What is asserted

- All five vendors report `status: "ok"` and at least one result.
- The merged report counts five successful vendors, zero failed, with no errors.
- `wide-search vendors` and MCP `list_vendors` show the five configured items.
- The MCP `search_wide` call returns the same per-vendor health through a real stdio client.

## Updating item references

Edit `tests/e2e/op.env.tpl` only. The item names are not secrets; the referenced field (`default`) is the concealed API-key field in each 1Password Login item. Do not replace a reference with a literal key.
