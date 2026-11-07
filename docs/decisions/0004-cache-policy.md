---
title: "0004: Cache only complete successful aggregates"
description: The search cache stores complete successful reports for 15 minutes, keyed by the effective execution plan; partial results are never cached.
status: accepted
date: 2026-11-07
decision-makers: "Spenser Hale and DeepSeek V4.1 Flash (drafting agent), with design review from Kimi K3.1 Pro"
---

## Context

A fan-out costs real money and several seconds. Repeating the same query within a short window is common while an agent iterates on a task. Caching partial results would be cheaper still, but it would turn a transient vendor outage into a 15-minute negative result and make the next call look healthier than it is. Cached latency would also mislead an agent comparing vendor performance.

## Options considered

1. **Cache complete successful aggregates only**: a failed vendor prevents the write; the next call retries. Cache hits report zero new cost and null latency.
2. **Cache partial aggregates with a status flag**: more hits, but transient failures persist and the report has to explain stale gaps.
3. **No disk cache; in-memory only**: simpler, but a CLI process is short-lived and would almost never hit.

## Decision

The disk cache stores only reports where every selected vendor returned `ok`. Successful empty results are cacheable. The key is the effective execution plan: normalized query, sorted selected vendors, max per vendor, freshness, mode, limit, and cache schema version. Budget affects the plan through vendor selection, not as an extra key.

The default TTL is 15 minutes. `--no-cache` bypasses both reads and writes. Entries are written atomically with restrictive permissions; corrupt or expired entries are deleted and treated as misses. A cache hit reports its age, zero new estimated cost, null per-vendor latency, and `cached: true` on selected vendors. Old latency is never replayed as current latency.

## Consequences

- A timeout does not poison the next 15 minutes.
- Repeated identical calls are free and fast, and the report is honest about being a cache hit.
- A partial result is always a fresh partial result, which costs more but preserves operational truth.
- The cache is per-user and per-machine; it is not shared across hosts.

## Revisit when

A shared or team cache becomes useful, vendor calls become cheap enough that caching is unnecessary, or an agent needs to distinguish "cached empty" from "fresh empty" with more detail than the current hit flag.

## Links

- Spec: [Wide search](../specs/wide-search.md)
- Plan: [Initial wide-search toolkit](../plans/2026-11-07-initial-wide-search.md)
