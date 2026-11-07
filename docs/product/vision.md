---
title: Vision
description: Who wide-search is for, the problem it solves, and what it will not become.
---

## Who it is for

People and agents doing broad web research where a single search index is not enough: competitive scans, vendor-gap analysis, literature and news sweeps, and any question where the cost of missing a source is high. The first consumer is a coding agent that needs a compact, structured result set it can reason over.

## The problem

Every search vendor has a different index, ranking, freshness behavior, and failure mode. Calling one vendor gives a confident but narrow answer; calling several by hand means five request shapes, five auth schemes, five result schemas, duplicate URLs, and no shared view of which vendors timed out or ran out of budget. The comparison itself is the missing product.

## What it is

One call fans a query out to every configured vendor in parallel, normalizes the results, dedupes by canonical URL, ranks with reciprocal rank fusion, and returns both the merged list and a per-vendor report. A second call fetches full page text with SSRF and size guards. The same SDK powers a CLI, an MCP server, and a generated agent skill.

## What it is not

- Not a deep-research agent that writes a report for you. It returns sources; the caller decides what they mean.
- Not a scraper fleet or a crawler. `fetch` reads the URLs you already have, up to a bounded cap.
- Not a vendor-neutral guarantee. Costs are estimates, `found_by` is not independent corroboration, and a vendor's result can be wrong.
- Not a replacement for a single-vendor search when one index is enough.
- Not a profile manager, job ledger, self-updater, or webhook delivery system in v0.1. Those are deliberate cuts.

## How we know it works

- A fan-out returns useful merged results even when one or two vendors fail or time out.
- The per-vendor report makes gaps and cost visible without reading vendor dashboards.
- An agent can drive the CLI from `--help` plus `agent-context`, with no out-of-band knowledge.
- The default budget is predictable enough to leave a fan-out running in a loop.
