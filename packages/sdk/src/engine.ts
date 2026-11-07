import { cacheKeyFor, SearchCache } from "./cache.js";
import {
  configuredVendorIds,
  isVendorConfigured,
  resolveConfig,
  type ResolvedConfig,
} from "./config.js";
import { WideSearchError, isWideSearchError } from "./errors.js";
import { mergeResults } from "./rank.js";
import {
  VENDOR_IDS,
  type Freshness,
  type SearchMode,
  type SearchReport,
  type VendorId,
  type VendorReport,
  type VendorReportStatus,
} from "./types.js";
import { DEFAULT_ADAPTERS } from "./vendors/index.js";
import { VENDOR_CATALOG, vendorCostUsd } from "./vendors/catalog.js";
import type { VendorAdapter, VendorSearchResponse } from "./vendors/types.js";

export interface SearchOptions {
  query: string;
  /** Restrict the candidate set. Omit to use the configured default vendors. */
  vendors?: readonly string[];
  maxPerVendor?: number;
  freshness?: Freshness;
  mode?: SearchMode;
  timeoutMs?: number;
  budgetUsd?: number;
  limit?: number;
  /** Set false to bypass both cache reads and writes. */
  cache?: boolean;
  signal?: AbortSignal;
}

export interface SearchDeps {
  config?: ResolvedConfig;
  adapters?: Partial<Record<VendorId, VendorAdapter>>;
  cache?: SearchCache;
  now?: () => number;
}

interface PlanEntry {
  vendor: VendorId;
  label: string;
  configured: boolean;
  costUsd: number;
  selected: boolean;
  reason?: string;
}

interface RunResult {
  status: "ok" | "timeout" | "error";
  results: VendorSearchResponse["results"];
  costUsd: number;
  latencyMs: number;
  error?: string;
  errorCode?: string;
  warnings: string[];
}

const CACHE_SCHEMA_VERSION = "1";
const MAX_LIMIT = 100;
const MAX_PER_VENDOR = 20;

export async function searchWide(
  options: SearchOptions,
  deps: SearchDeps = {},
): Promise<SearchReport> {
  const config = deps.config ?? resolveConfig();
  const now = deps.now ?? Date.now;
  const started = performance.now();
  const query = options.query.trim();
  if (!query) {
    throw new WideSearchError({
      code: "E_VALIDATION",
      message: "query must not be empty",
      hint: "Pass a natural-language search query.",
    });
  }

  const mode = options.mode ?? "standard";
  const maxPerVendor = clampInt(
    options.maxPerVendor ?? config.maxPerVendor,
    1,
    MAX_PER_VENDOR,
    "max_per_vendor",
  );
  const limit = clampInt(options.limit ?? 50, 1, MAX_LIMIT, "limit");
  const budgetUsd = options.budgetUsd ?? config.budgetUsd;
  if (!Number.isFinite(budgetUsd) || budgetUsd < 0) {
    throw new WideSearchError({
      code: "E_VALIDATION",
      message: "budget_usd must be zero or greater",
      got: String(options.budgetUsd),
    });
  }

  const requested = normalizeRequestedVendors(options.vendors);
  const plan = buildPlan(config, requested, mode, budgetUsd);
  const selectedEntries = plan.filter((entry) => entry.selected);
  const selectedIds = selectedEntries.map((entry) => entry.vendor);
  const cacheEnabled = options.cache !== false && config.cacheTtlMs > 0;
  const cache = deps.cache ?? new SearchCache({
    dir: config.cacheDir,
    ttlMs: config.cacheTtlMs,
    now,
  });

  const key = cacheKeyFor({
    schema_version: CACHE_SCHEMA_VERSION,
    query: query.replace(/\s+/g, " "),
    vendors: [...selectedIds].sort(),
    configured_vendors: configuredVendorIds(config.credentials).sort(),
    max_per_vendor: maxPerVendor,
    freshness: options.freshness ?? null,
    mode,
    limit,
    snippet_chars: config.snippetChars,
  });
  const cacheInfo = {
    enabled: cacheEnabled,
    hit: false,
    stored: false,
    age_ms: null as number | null,
    key: key.slice(0, 16),
  };

  if (cacheEnabled) {
    const hit = cache.read(key);
    if (hit) {
      return applyCacheHit(hit.report, hit.ageMs, key, now, started, budgetUsd);
    }
  }

  const timeoutMs = options.timeoutMs ?? config.timeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new WideSearchError({
      code: "E_VALIDATION",
      message: "timeout_ms must be a positive number",
      got: String(options.timeoutMs),
    });
  }
  const runs = await Promise.all(
    selectedEntries.map((entry) =>
      runVendor(
        entry,
        {
          query,
          maxResults: Math.min(maxPerVendor, VENDOR_CATALOG[entry.vendor].maxResults),
          mode,
          ...(options.freshness ? { freshness: options.freshness } : {}),
          credentials: config.credentials[entry.vendor],
          userAgent: config.userAgent,
        },
        timeoutMs,
        options.signal,
        deps.adapters?.[entry.vendor] ?? DEFAULT_ADAPTERS[entry.vendor],
      ),
    ),
  );

  const runByVendor = new Map<VendorId, RunResult>();
  selectedEntries.forEach((entry, index) => {
    const run = runs[index];
    if (run) runByVendor.set(entry.vendor, run);
  });

  const reports: VendorReport[] = plan.map((entry) => {
    if (!entry.selected) {
      return {
        vendor: entry.vendor,
        label: entry.label,
        selected: false,
        status: entry.configured ? "skipped_budget" : "skipped_unconfigured",
        results: 0,
        latency_ms: null,
        estimated_cost_usd: 0,
        ...(entry.reason ? { reason: entry.reason } : {}),
      };
    }
    const run = runByVendor.get(entry.vendor);
    if (!run) {
      return {
        vendor: entry.vendor,
        label: entry.label,
        selected: true,
        status: "error",
        results: 0,
        latency_ms: null,
        estimated_cost_usd: 0,
        error: "vendor was selected but did not run",
        error_code: "E_NETWORK",
      };
    }
    return {
      vendor: entry.vendor,
      label: entry.label,
      selected: true,
      status: run.status,
      results: run.results.length,
      latency_ms: run.latencyMs,
      estimated_cost_usd: run.status === "ok" ? run.costUsd : 0,
      ...(run.error ? { error: run.error } : {}),
      ...(run.errorCode ? { error_code: run.errorCode } : {}),
    };
  });

  const allResults = runs.flatMap((run) => (run.status === "ok" ? run.results : []));
  const merged = mergeResults(allResults, {
    limit,
    snippetChars: config.snippetChars,
  });

  const selectedReports = reports.filter((report) => report.selected);
  const vendorsOk = selectedReports.filter((report) => report.status === "ok");
  const allFailed = selectedReports.length > 0 && vendorsOk.length === 0;
  const estimatedCost = selectedReports.reduce(
    (total, report) => total + report.estimated_cost_usd,
    0,
  );
  const warnings = runs.flatMap((run) => run.warnings);

  const hints = buildHints({
    reports,
    selectedReports,
    allFailed,
    truncated: merged.truncated,
    totalMerged: merged.resultsAfterDedupe,
    limit,
    budgetUsd,
    warnings,
    estimatedCost,
  });

  const report: SearchReport = {
    schema_version: CACHE_SCHEMA_VERSION,
    query,
    mode,
    ...(options.freshness ? { freshness: options.freshness } : {}),
    generated_at: new Date(now()).toISOString(),
    cache: cacheInfo,
    limit,
    truncated: merged.truncated,
    total_merged: merged.resultsAfterDedupe,
    results: merged.results,
    vendors: reports,
    stats: {
      vendors_configured: configuredVendorIds(config.credentials).length,
      vendors_selected: selectedEntries.length,
      vendors_ok: vendorsOk.length,
      vendors_failed: selectedReports.length - vendorsOk.length,
      results_before_dedupe: merged.resultsBeforeDedupe,
      results_after_dedupe: merged.resultsAfterDedupe,
      invalid_urls: merged.invalidUrls,
      estimated_cost_usd: estimatedCost,
      cached_estimated_cost_usd: 0,
      budget_usd: budgetUsd,
      duration_ms: performance.now() - started,
    },
    all_failed: allFailed,
    hints,
  };

  const complete = selectedReports.every((entry) => entry.status === "ok");
  if (cacheEnabled && complete && !allFailed && selectedEntries.length > 0) {
    try {
      cache.write(key, report);
      report.cache.stored = true;
    } catch (error) {
      report.hints.push(
        `Cache write failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (cacheEnabled && !complete) {
    report.hints.push("This partial aggregate was not cached; a later call will retry the failed vendors.");
  }

  return report;
}

function buildPlan(
  config: ResolvedConfig,
  requested: VendorId[] | undefined,
  mode: SearchMode,
  budgetUsd: number,
): PlanEntry[] {
  const candidates = requested ?? config.vendors;
  if (candidates.length === 0) {
    throw new WideSearchError({
      code: "E_CONFIG",
      message: "No vendors are enabled",
      hint: "Set WIDE_SEARCH_VENDORS or remove it to use every configured vendor.",
    });
  }

  const plan: PlanEntry[] = candidates.map((vendor) => ({
    vendor,
    label: VENDOR_CATALOG[vendor].label,
    configured: isVendorConfigured(vendor, config.credentials),
    costUsd: vendorCostUsd(vendor, mode),
    selected: false,
  }));

  const configured = plan.filter((entry) => entry.configured);
  if (configured.length === 0) {
    throw new WideSearchError({
      code: "E_CONFIG",
      message: "No configured search vendors",
      hint: "Set at least one key: EXA_API_KEY, TAVILY_API_KEY, PARALLEL_API_KEY, PERPLEXITY_API_KEY, DATAFORSEO_LOGIN/PASSWORD, ZAI_API_KEY, or OLLAMA_API_KEY. Run `wide-search vendors` to see the current state.",
      validValues: VENDOR_IDS,
    });
  }

  const ordered = [...configured].sort((a, b) => {
    if (a.costUsd !== b.costUsd) return a.costUsd - b.costUsd;
    return a.vendor.localeCompare(b.vendor);
  });

  let remaining = budgetUsd;
  for (const entry of ordered) {
    if (entry.costUsd <= remaining + 1e-9) {
      entry.selected = true;
      remaining -= entry.costUsd;
    } else {
      entry.reason = `estimated $${entry.costUsd.toFixed(4)} exceeds the remaining budget $${remaining.toFixed(4)}`;
    }
  }

  if (!plan.some((entry) => entry.selected)) {
    const cheapest = ordered[0];
    throw new WideSearchError({
      code: "E_BUDGET",
      message: "The per-call budget is below the cheapest configured vendor",
      got: `$${budgetUsd.toFixed(4)}`,
      hint: `Raise --budget-usd above $${cheapest?.costUsd.toFixed(4) ?? "0.0000"}, or set WIDE_SEARCH_MAX_COST_USD.`,
    });
  }

  for (const entry of plan) {
    if (!entry.configured) {
      entry.reason = `missing ${VENDOR_CATALOG[entry.vendor].envKeys.join(" + ")}`;
    }
  }

  return plan;
}

async function runVendor(
  entry: PlanEntry,
  args: {
    query: string;
    maxResults: number;
    mode: SearchMode;
    freshness?: Freshness;
    credentials: Record<string, string | undefined>;
    userAgent: string;
  },
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
  adapter: VendorAdapter | undefined,
): Promise<RunResult> {
  if (!adapter) {
    return {
      status: "error",
      results: [],
      costUsd: 0,
      latencyMs: 0,
      error: `no adapter registered for ${entry.vendor}`,
      errorCode: "E_CONFIG",
      warnings: [],
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("timeout", "TimeoutError"));
  }, timeoutMs);
  const onAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) onAbort();
    else externalSignal.addEventListener("abort", onAbort, { once: true });
  }

  const started = performance.now();
  try {
    const response = await adapter.search({
      ...args,
      signal: controller.signal,
    });
    return {
      status: "ok",
      results: response.results,
      costUsd: response.costUsd,
      latencyMs: performance.now() - started,
      warnings: response.warnings ?? [],
    };
  } catch (error) {
    const latencyMs = performance.now() - started;
    const code = isWideSearchError(error)
      ? error.code
      : timedOut
        ? "E_TIMEOUT"
        : "E_NETWORK";
    return {
      status: code === "E_TIMEOUT" ? "timeout" : "error",
      results: [],
      costUsd: 0,
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
      errorCode: code,
      warnings: [],
    };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

function applyCacheHit(
  cached: SearchReport,
  ageMs: number,
  key: string,
  now: () => number,
  started: number,
  budgetUsd: number,
): SearchReport {
  const clone = structuredClone(cached);
  clone.generated_at = new Date(now()).toISOString();
  clone.stats.budget_usd = budgetUsd;
  clone.cache = {
    enabled: true,
    hit: true,
    stored: false,
    age_ms: ageMs,
    key: key.slice(0, 16),
  };
  clone.stats.cached_estimated_cost_usd = cached.stats.estimated_cost_usd;
  clone.stats.estimated_cost_usd = 0;
  clone.stats.duration_ms = performance.now() - started;
  clone.vendors = clone.vendors.map((vendor) =>
    vendor.selected
      ? { ...vendor, latency_ms: null, estimated_cost_usd: 0, cached: true }
      : vendor,
  );
  clone.hints = [
    `Served from cache (${Math.round(ageMs / 1_000)}s old); vendor calls were not repeated.`,
    ...clone.hints.filter((hint) => !hint.startsWith("Served from cache")),
  ];
  return clone;
}

function buildHints(args: {
  reports: VendorReport[];
  selectedReports: VendorReport[];
  allFailed: boolean;
  truncated: boolean;
  totalMerged: number;
  limit: number;
  budgetUsd: number;
  warnings: string[];
  estimatedCost: number;
}): string[] {
  const hints: string[] = [];
  const failed = args.selectedReports.filter((report) => report.status !== "ok");
  const skippedBudget = args.reports.filter((report) => report.status === "skipped_budget");
  const skippedUnconfigured = args.reports.filter(
    (report) => report.status === "skipped_unconfigured",
  );

  if (args.allFailed) {
    hints.push("All selected vendors failed; no results were returned. See vendors[] for error codes.");
  } else if (failed.length > 0) {
    hints.push(
      `Partial results: ${failed.length} of ${args.selectedReports.length} selected vendors failed (see vendors[]).`,
    );
  }

  if (skippedBudget.length > 0) {
    hints.push(
      `Budget $${args.budgetUsd.toFixed(4)} selected ${args.selectedReports.length} vendor(s); skipped ${skippedBudget
        .map((report) => report.vendor)
        .join(", ")}. Raise --budget-usd to include them.`,
    );
  }
  if (skippedUnconfigured.length > 0) {
    hints.push(
      `Not configured: ${skippedUnconfigured
        .map((report) => report.vendor)
        .join(", ")}. Run \`wide-search vendors\` for the required keys.`,
    );
  }
  if (args.truncated) {
    hints.push(
      `Showing ${args.limit} of ${args.totalMerged} merged results; raise --limit (max ${MAX_LIMIT}) to see more.`,
    );
  }
  for (const warning of args.warnings) hints.push(warning);
  if (args.estimatedCost > 0) {
    hints.push("Costs are estimates, not vendor invoices.");
  }
  return hints;
}

function normalizeRequestedVendors(vendors: readonly string[] | undefined): VendorId[] | undefined {
  if (!vendors || vendors.length === 0) return undefined;
  const seen = new Set<VendorId>();
  for (const raw of vendors) {
    const vendor = raw.trim().toLowerCase();
    if (!(VENDOR_IDS as readonly string[]).includes(vendor)) {
      throw new WideSearchError({
        code: "E_VALIDATION",
        message: "Unknown vendor",
        got: raw,
        validValues: VENDOR_IDS,
      });
    }
    seen.add(vendor as VendorId);
  }
  return [...seen];
}

function clampInt(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new WideSearchError({
      code: "E_VALIDATION",
      message: `${name} must be an integer between ${min} and ${max}`,
      got: String(value),
    });
  }
  return value;
}
