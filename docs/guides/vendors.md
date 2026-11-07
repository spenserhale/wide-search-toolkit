---
title: "Vendor adapters"
description: Read this when adding or changing a search vendor, its credentials, result parsing, costs, or failure mapping.
---

## Purpose

Read this guide when adding a vendor adapter, changing a vendor's request or response mapping, updating estimated costs, or debugging a vendor-specific failure.

## Policy

- **One adapter per vendor.** Each adapter owns its auth header, request body, response validation, rank preservation, and vendor-specific limits. The engine never parses a vendor payload.
- **Normalize, don't leak.** Return `{title, url, snippet, date?, vendor, rank}`. Preserve the vendor's 1-based order; do not re-rank inside the adapter.
- **Declare the limits.** `maxResults`, `supportsFreshness`, `envKeys`, `costUsd`, and `docsUrl` live in `packages/sdk/src/vendors/catalog.ts` and are mirrored by the adapter.
- **Validate at the boundary.** Parse the response with Zod (or equivalent) and throw `WideSearchError` with an enumerated code. A `200` with a malformed body is a network/protocol error, not an empty result.
- **Honor the signal.** Pass the provided `AbortSignal` to the request. The engine owns the timeout; the adapter must not create a second one.
- **Map failures consistently.** 401/403 → `E_AUTH`, 429 → `E_RATE_LIMIT`, 5xx and transport errors → `E_NETWORK`, 4xx validation → `E_VALIDATION`, aborts → `E_TIMEOUT`.
- **Keep freshness honest.** If the vendor does not support a freshness filter, return a warning rather than silently ignoring the request.
- **Costs are estimates.** Update the catalog when pricing changes and say so in the changelog; never present an estimate as an invoice.

## Adding a vendor

1. Add the id to `VENDOR_IDS` in `packages/sdk/src/types.ts`.
2. Add the catalog entry and env keys in `packages/sdk/src/vendors/catalog.ts` and `packages/sdk/src/config.ts`.
3. Implement `packages/sdk/src/vendors/<vendor>.ts` against `VendorAdapter`.
4. Register it in `packages/sdk/src/vendors/index.ts` and export it from the SDK.
5. Add a mocked-fetch test in `packages/sdk/tests/adapters.test.ts` covering a successful response, the request body/headers, and at least one error mapping.
6. Run `bun test`, `bun run lint`, `bun run build:skill`, and update the vendor table in the skill/README if costs or limits changed.
7. Add a changelog line and, if the vendor changes the cost model or public surface, a decision record.

## Implementation notes

- `requestJson` in `packages/sdk/src/vendors/http.ts` is the shared request path. It maps HTTP/transport failures and returns parsed JSON, so adapters only validate the success shape.
- `toNormalizedResults` in `packages/sdk/src/vendors/util.ts` handles URL filtering, date normalization, snippet clipping, and rank assignment. Use it unless the vendor needs a genuinely different rule.
- Tavily, Perplexity, and Parallel cap at 20 results; Ollama caps at 10; the adapter clamps even if the caller asks for 20.
- DataForSEO uses Basic auth built from `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`; both are required. Z.AI accepts `ZAI_API_KEY` or `Z_AI_API_KEY`.
- Firecrawl uses `POST https://api.firecrawl.dev/v2/search` with a Bearer key, requests `sources: ["web"]`, maps freshness to `tbs`, and does not request `scrapeOptions`; snippets only.
- TinyFish uses `GET https://api.search.tinyfish.ai` with `X-API-Key`, `domain_type=web`, and `recency_minutes` for freshness. It returns 10 results per page and has no limit parameter, so the adapter caps at 10.
- The engine's budget selection uses the catalog cost for the chosen mode. If a vendor has a fast/standard price difference, encode both. Firecrawl and TinyFish estimates are conservative; TinyFish is free up to 12,000 requests/day.

## Related docs

- [Spec](../specs/wide-search.md)
- [Decision 0003: budget semantics](../decisions/0003-budget-semantics.md)
- [Security guide](security.md)
- [Testing guide](testing.md)
