---
title: "0002: Normalize inside adapters and rank with plain RRF"
description: Each adapter owns its vendor response parsing and returns one normalized row shape; the engine dedupes by canonical URL and fuses ranks with reciprocal rank fusion at k=60.
status: accepted
date: 2026-11-07
decision-makers: "Spenser Hale and DeepSeek V4.1 Flash (drafting agent), with design review from Kimi K3.1 Pro"
---

## Context

The seven supported vendors return different envelopes, date formats, rank fields, and failure modes. The engine also has to merge lists of unequal length and quality without pretending one vendor's relevance score is comparable to another's. Keeping raw payloads around would grow the cache, complicate the public schema, and keep vendor-specific knowledge in two places.

A prior design draft suggested a `found_by` bonus on top of reciprocal rank fusion. We tested the principle against the RRF literature and the advisor's review: RRF already rewards appearing in multiple lists, and a bonus would double-count the same signal without an evaluation set to justify its weight.

## Options considered

1. **Normalize inside each adapter**: the adapter validates its response, preserves its 1-based rank, and returns the stable row shape. The engine only selects, executes, dedupes, fuses, and reports.
2. **Return raw payloads and normalize in the engine**: one shared normalizer, but every vendor's schema leaks into the engine and the cache/output surface.
3. **Blend vendor relevance scores**: compare normalized scores across vendors. Rejected because the scores mean different things and are not calibrated against each other.

## Decision

Adapters normalize their own successful payloads. The public row is `{title, url, snippet, date?, vendor, rank}` with a 1-based vendor rank.

The engine canonicalizes URLs, keeps one row per canonical URL, and lets each vendor contribute its best rank once. It ranks by reciprocal rank fusion with `k = 60`, then breaks ties on `found_by`, `best_rank`, and canonical URL. It does not add a `found_by` bonus and does not apply date decay. Freshness is a vendor-side request filter where supported.

## Consequences

- Vendor quirks stay in one file per vendor; the engine and reports are vendor-agnostic.
- RRF is transparent and needs no per-vendor quality weights. It can still be wrong when one vendor is much better than another; that needs an evaluation set before tuning.
- `found_by` remains visible as an agreement signal but is not treated as independent corroboration.
- Canonicalization can over-merge distinct pages that share a URL-shaped identity; the conservative tracking-parameter list limits that risk.
- Raw vendor payloads are not exposed or cached in v0.1. If debugging needs them, add an internal diagnostic hook rather than widening the public schema.

## Revisit when

An evaluation set shows a consistent per-vendor quality gap, canonicalization causes visible over-merging, or a vendor exposes a calibrated relevance score that is comparable across providers.

## Links

- Spec: [Wide search](../specs/wide-search.md)
- Plan: [Initial wide-search toolkit](../plans/2026-11-07-initial-wide-search.md)
