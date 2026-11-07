---
title: "0003: Select vendors cheapest-first against an estimate budget"
description: By default every configured vendor is a candidate, selection is cheapest-first, and a vendor is selected only when its whole estimated call fits the remaining per-call budget.
status: accepted
date: 2026-11-07
decision-makers: "Spenser Hale and DeepSeek V4.1 Flash (drafting agent), with design review from Kimi K3.1 Pro"
---

## Context

A wide call across seven vendors costs roughly $0.036 at the cheapest tiers before free credits, but the expensive vendors (Z.AI and Ollama at about $0.01 each) dominate the total. An agent running in a loop needs a predictable cap and a clear explanation of what it did not call. The caller also needs to distinguish "this vendor returned no results" from "this vendor was never called."

## Options considered

1. **All configured vendors, cheapest-first, whole-call budget fit**: the widest default, with a deterministic cutoff and a report entry for every skipped vendor.
2. **A curated standard set (Parallel, Perplexity, Exa, Tavily) with expensive vendors opt-in**: cheaper by default, but it hides the vendors that may cover a gap and makes the default less "wide."
3. **Call every configured vendor and warn after the fact**: simplest execution, but the budget becomes advisory and an agent loop can spend without a hard plan.

## Decision

The default candidate set is every configured vendor. Candidates are ordered by estimated cost (then vendor id for determinism). A vendor is selected only when its whole estimated call cost fits the remaining per-call budget; otherwise it is reported as `skipped_budget` with the remaining amount. `--vendor` narrows the candidate set but does not bypass the budget. An explicit `--budget-usd` overrides the configured budget.

The budget is an estimate cap, not a billing guarantee. The report labels costs as estimates and never presents them as invoices. Selected vendors run in parallel after the sequential selection step.

## Consequences

- The default is wide and deterministic; the same inputs produce the same vendor plan.
- Expensive vendors are dropped first when the budget is tight, which is the intended behavior but can surprise a caller who expected Z.AI or Ollama. The `vendors[]` report makes the skip explicit.
- A budget below the cheapest configured vendor is an `E_BUDGET` error rather than a silent empty call.
- Estimated costs must be updated when vendor pricing changes; the vendor guide owns that procedure.

## Revisit when

Vendor pricing changes materially, a free tier makes an expensive vendor effectively free at the caller's volume, or an evaluation shows the cheapest-first order produces worse result quality than a curated set.

## Links

- Spec: [Wide search](../specs/wide-search.md)
- Plan: [Initial wide-search toolkit](../plans/2026-11-07-initial-wide-search.md)
