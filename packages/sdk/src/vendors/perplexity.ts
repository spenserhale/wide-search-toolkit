import { z } from "zod";
import type { VendorAdapter, VendorSearchArgs, VendorSearchResponse } from "./types.js";
import { requestJson } from "./http.js";
import { toNormalizedResults } from "./util.js";
import { VENDOR_CATALOG } from "./catalog.js";

const ResponseSchema = z.object({
  results: z
    .array(
      z
        .object({
          title: z.string().nullish(),
          url: z.string(),
          snippet: z.string().nullish(),
          date: z.string().nullish(),
          last_updated: z.string().nullish(),
        })
        .passthrough(),
    )
    .default([]),
});

export const perplexityAdapter: VendorAdapter = {
  id: "perplexity",
  label: VENDOR_CATALOG.perplexity.label,
  maxResults: VENDOR_CATALOG.perplexity.maxResults,
  supportsFreshness: VENDOR_CATALOG.perplexity.supportsFreshness,
  catalog: VENDOR_CATALOG.perplexity,
  estimateCostUsd: (mode) => VENDOR_CATALOG.perplexity.costUsd[mode],
  async search(args: VendorSearchArgs): Promise<VendorSearchResponse> {
    const body: Record<string, unknown> = {
      query: args.query,
      max_results: Math.min(args.maxResults, VENDOR_CATALOG.perplexity.maxResults),
      search_type: args.mode === "fast" ? "fast" : "web",
      max_tokens_per_page: 512,
    };
    if (args.freshness) body.search_recency_filter = args.freshness;

    const raw = await requestJson({
      vendor: "perplexity",
      url: "https://api.perplexity.ai/search",
      headers: { authorization: `Bearer ${args.credentials.PERPLEXITY_API_KEY ?? ""}` },
      body,
      signal: args.signal,
      userAgent: args.userAgent,
    });
    const response = ResponseSchema.parse(raw);
    const results = toNormalizedResults(
      "perplexity",
      response.results.map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        date: item.date ?? item.last_updated,
      })),
      args.maxResults,
    );

    return { results, costUsd: this.estimateCostUsd(args.mode) };
  },
};
