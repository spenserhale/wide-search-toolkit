import { z } from "zod";
import type { VendorAdapter, VendorSearchArgs, VendorSearchResponse } from "./types.js";
import { dateDaysAgo, FRESHNESS_DAYS, requestJson } from "./http.js";
import { toNormalizedResults } from "./util.js";
import { VENDOR_CATALOG } from "./catalog.js";

const ResponseSchema = z.object({
  results: z
    .array(
      z
        .object({
          title: z.string().nullish(),
          url: z.string(),
          publish_date: z.string().nullish(),
          excerpts: z.array(z.string()).nullish(),
        })
        .passthrough(),
    )
    .default([]),
});

export const parallelAdapter: VendorAdapter = {
  id: "parallel",
  label: VENDOR_CATALOG.parallel.label,
  maxResults: VENDOR_CATALOG.parallel.maxResults,
  supportsFreshness: VENDOR_CATALOG.parallel.supportsFreshness,
  catalog: VENDOR_CATALOG.parallel,
  estimateCostUsd: (mode) => VENDOR_CATALOG.parallel.costUsd[mode],
  async search(args: VendorSearchArgs): Promise<VendorSearchResponse> {
    const advancedSettings: Record<string, unknown> = {
      max_results: Math.min(args.maxResults, VENDOR_CATALOG.parallel.maxResults),
    };
    if (args.freshness) {
      advancedSettings.source_policy = {
        after_date: dateDaysAgo(FRESHNESS_DAYS[args.freshness]),
      };
    }

    const body: Record<string, unknown> = {
      objective: args.query,
      search_queries: [args.query],
      mode: args.mode === "fast" ? "fast" : "advanced",
      advanced_settings: advancedSettings,
    };

    const raw = await requestJson({
      vendor: "parallel",
      url: "https://api.parallel.ai/v1/search",
      headers: { "x-api-key": args.credentials.PARALLEL_API_KEY ?? "" },
      body,
      signal: args.signal,
      userAgent: args.userAgent,
    });
    const response = ResponseSchema.parse(raw);
    const results = toNormalizedResults(
      "parallel",
      response.results.map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.excerpts?.join("\n\n"),
        date: item.publish_date,
      })),
      args.maxResults,
    );

    return { results, costUsd: this.estimateCostUsd(args.mode) };
  },
};
