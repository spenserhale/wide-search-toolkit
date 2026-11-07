---
title: "Security"
description: Read this when changing page fetching, delivery, secrets, cache permissions, or anything that makes an outbound request from user-supplied input.
---

## Purpose

Read this guide when changing `fetchPages`, adding a delivery sink, touching credentials or config, or reviewing a new outbound-request path.

## Policy

- **Treat every URL as hostile.** `fetchPages` is an arbitrary-URL primitive exposed through the SDK, CLI, and MCP. The guard lives in the SDK so all three surfaces inherit it.
- **HTTP(S) only; no embedded credentials.** Reject other schemes and URLs with a username or password.
- **Block private egress by default.** Loopback, private, link-local, multicast, reserved, documentation, metadata, IPv4-mapped IPv6, and NAT64-mapped private destinations are rejected. The only opt-in is `WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1`, and it is a configuration decision, not a per-call argument.
- **Check every resolved address and pin the connection.** Resolve once, reject if any address is private, then use a custom `lookup` so the connection goes to the validated address. A hostname-only precheck leaves a DNS-rebinding window.
- **Revalidate redirects.** Follow at most five; every hop goes through the same scheme, credential, host, and address checks.
- **Bound the response.** Per-page and aggregate character caps, a decompressed byte cap, and a timeout. Do not trust `Content-Length`.
- **Keep secrets out of output.** `config show` reports set/missing and the winning source, never the value. Error bodies are truncated before they reach a report.
- **Restrict cache files.** The cache directory is created with user-only permissions; entries are written to a temp file and atomically renamed with mode `0600`.
- **No webhook delivery in v0.1.** A webhook is a second SSRF-capable egress path. `--deliver` supports stdout and atomic file writes only.
- **Live E2E keys live only in process memory.** `tests/e2e/op.env.tpl` contains `op://` references, not keys. The helper runs `op inject` with stdout captured, parses it in memory, and passes the values to the child CLI/MCP environment. It never writes a rendered file, cache entry, fixture, or log line, and it omits injected stdout from error messages. Live tests skip unless `WIDE_SEARCH_OP_E2E=1`.

## Implementation notes

- `packages/sdk/src/fetch.ts` is the guard. `isPrivateAddress`, `isBlockedHostname`, and the HTTP request path are the places to review.
- The HTTP request uses `node:http`/`node:https` with a custom `lookup`; this is deliberate because a plain `fetch` cannot pin the address. Do not replace it with `fetch` without preserving the pin.
- The fetch path handles gzip, deflate, and brotli with a decompressed byte cap. A new encoding needs the same cap.
- The MCP tools are annotated `readOnlyHint: true` and `openWorldHint: true`. `fetch_pages` is read-only but still performs outbound requests; do not downgrade the private-host guard to a tool argument.
- Vendor API keys are read from env, `.env`, or the user config file. They are never written to the cache or report.
- The error object keeps `statusCode` and `retryAfterSeconds`; use them for hints, not for secrets.

## Related docs

- [Decision 0005: fetch SSRF posture](../decisions/0005-fetch-ssrf-posture.md)
- [Vendor guide](vendors.md)
- [Testing guide](testing.md)
