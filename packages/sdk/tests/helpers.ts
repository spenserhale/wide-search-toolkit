import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedConfig } from "../src/config.js";
import type {
  NormalizedResult,
  SearchReport,
  VendorId,
} from "../src/types.js";
import type { VendorAdapter, VendorSearchArgs, VendorSearchResponse } from "../src/vendors/types.js";
import { VENDOR_CATALOG } from "../src/vendors/catalog.js";

export function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  const base: ResolvedConfig = {
    vendors: ["exa", "tavily"],
    timeoutMs: 1_000,
    maxPerVendor: 10,
    budgetUsd: 1,
    cacheTtlMs: 0,
    cacheDir: join(tmpdir(), "wide-search-test-cache"),
    fetchMaxChars: 20_000,
    fetchTotalMaxChars: 100_000,
    fetchConcurrency: 4,
    fetchTimeoutMs: 15_000,
    snippetChars: 500,
    allowPrivateHosts: false,
    output: "toon",
    userAgent: "wide-search-test",
    credentials: {
      exa: { EXA_API_KEY: "exa-key" },
      tavily: { TAVILY_API_KEY: "tavily-key" },
      parallel: {},
      perplexity: {},
      dataforseo: {},
      zai: {},
      ollama: {},
    },
    sources: {},
    credentialSources: {},
    keychain: { status: "disabled" },
    envFiles: [],
    configFile: null,
    cwd: process.cwd(),
  };
  return {
    ...base,
    ...overrides,
    credentials: { ...base.credentials, ...(overrides.credentials ?? {}) },
  };
}

export function result(
  vendor: VendorId,
  rank: number,
  url: string,
  title = `${vendor} result ${rank}`,
): NormalizedResult {
  return {
    title,
    url,
    snippet: `${title} snippet`,
    vendor,
    rank,
  };
}

export function fakeAdapter(
  id: VendorId,
  results: NormalizedResult[],
  options: {
    costUsd?: number;
    throwError?: Error;
    warnings?: string[];
    delayMs?: number;
  } = {},
): VendorAdapter {
  return {
    id,
    label: VENDOR_CATALOG[id].label,
    maxResults: VENDOR_CATALOG[id].maxResults,
    supportsFreshness: VENDOR_CATALOG[id].supportsFreshness,
    catalog: VENDOR_CATALOG[id],
    estimateCostUsd: () => options.costUsd ?? VENDOR_CATALOG[id].costUsd.standard,
    async search(args: VendorSearchArgs): Promise<VendorSearchResponse> {
      if (options.delayMs) {
        await new Promise<void>((resolve, reject) => {
          if (args.signal.aborted) {
            reject(new DOMException("timeout", "TimeoutError"));
            return;
          }
          const timer = setTimeout(resolve, options.delayMs);
          args.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("timeout", "TimeoutError"));
            },
            { once: true },
          );
        });
      }
      if (options.throwError) throw options.throwError;
      return {
        results,
        costUsd: options.costUsd ?? VENDOR_CATALOG[id].costUsd.standard,
        ...(options.warnings ? { warnings: options.warnings } : {}),
      };
    },
  };
}

export function makeReport(overrides: Partial<SearchReport> = {}): SearchReport {
  return {
    schema_version: "1",
    query: "test query",
    mode: "standard",
    generated_at: new Date(0).toISOString(),
    cache: { enabled: true, hit: false, stored: true, age_ms: null, key: "abc123" },
    limit: 50,
    truncated: false,
    total_merged: 1,
    results: [
      {
        rank: 1,
        title: "Example",
        url: "https://example.com/",
        snippet: "Example snippet",
        vendors: ["exa"],
        found_by: 1,
        best_rank: 1,
        score: 1 / 61,
      },
    ],
    vendors: [
      {
        vendor: "exa",
        label: "Exa",
        selected: true,
        status: "ok",
        results: 1,
        latency_ms: 10,
        estimated_cost_usd: 0.005,
      },
    ],
    stats: {
      vendors_configured: 1,
      vendors_selected: 1,
      vendors_ok: 1,
      vendors_failed: 0,
      results_before_dedupe: 1,
      results_after_dedupe: 1,
      invalid_urls: 0,
      estimated_cost_usd: 0.005,
      cached_estimated_cost_usd: 0,
      budget_usd: 0.05,
      duration_ms: 12,
    },
    all_failed: false,
    hints: [],
    ...overrides,
  };
}
