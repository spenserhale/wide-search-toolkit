---
title: "0005: Guard page fetching against SSRF by default"
description: fetchPages accepts only public HTTP(S) targets, checks every resolved address, pins the connection, validates redirects, and bounds response size; private access is an explicit config opt-in.
status: accepted
date: 2026-11-07
decision-makers: "Spenser Hale and DeepSeek V4.1 Flash (drafting agent), with design review from Kimi K3.1 Pro"
---

## Context

`fetchPages` is an arbitrary-URL primitive exposed through the SDK, CLI, and MCP server. Without a guard, an agent or a prompt-injected page could reach localhost, cloud metadata endpoints, private networks, or a DNS-rebinding target. A hostname-only precheck is insufficient because DNS can change between validation and connection. The same primitive must also avoid decompression bombs and unbounded text.

## Options considered

1. **No guard, trust the caller**: simplest, but unsafe for an MCP tool that may be driven by untrusted content.
2. **Hostname and IP precheck only**: blocks obvious cases but leaves the DNS-rebinding window open.
3. **Precheck plus DNS pinning, redirect validation, and size caps**: more code, but the guard travels with the primitive instead of relying on every caller.

## Decision

`fetchPages` accepts only `http` and `https`, rejects embedded credentials, and blocks loopback, private, link-local, multicast, reserved, documentation, metadata, IPv4-mapped IPv6, and NAT64-mapped private destinations by default. It resolves DNS, checks every address, and pins the chosen address into the connection so the hostname cannot be rebound between validation and request. Redirects are revalidated at every hop and capped at five. Compressed bodies are decompressed with a byte cap; per-page and aggregate character caps bound the returned text.

The only private-network opt-in is `WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1`. It is a configuration decision, not a per-call CLI or MCP argument.

Webhook delivery is deferred for v0.1 because it is a second outbound-request primitive and needs the same guard. `--deliver` supports stdout and atomic file writes only.

## Consequences

- An agent cannot use `fetch` to scan a local network or cloud metadata by default.
- The DNS pin makes the check materially stronger than a hostname allowlist, at the cost of a custom Node HTTP request path instead of a one-line `fetch`.
- Users with a legitimate private target must opt in explicitly and accept the risk.
- The guard adds code and tests, but it is shared by all three surfaces.

## Revisit when

The project needs a hosted multi-tenant deployment, a proxy or allowlist policy, or webhook delivery. Any of those reopens the egress model.

## Links

- Spec: [Wide search](../specs/wide-search.md)
- Plan: [Initial wide-search toolkit](../plans/2026-11-07-initial-wide-search.md)
