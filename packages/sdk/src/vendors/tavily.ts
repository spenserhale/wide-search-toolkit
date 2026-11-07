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
          content: z.string().nullish(),
          published_date: z.string().nullish(),
        })
        .passthrough(),
    )
    .default([]),
});

export const tavilyAdapter: VendorAdapter = {
  id: "tavily",
  label: VENDOR_CATALOG.tavily.label,
  maxResults: VENDOR_CATALOG.tavily.maxResults,
  supportsFreshness: VENDOR_CATALOG.tavily.supportsFreshness,
  catalog: VENDOR_CATALOG.tavily,
  estimateCostUsd: (mode) => VENDOR_CATALOG.tavily.costUsd[mode],
  async search(args: VendorSearchArgs): Promise<VendorSearchResponse> {
    const body: Record<string, unknown> = {
      query: args.query,
      max_results: Math.min(args.maxResults, VENDOR_CATALOG.tavily.maxResults),
      search_depth: args.mode === "fast" ? "fast" : "basic",
      include_published_date: true,
      include_answer: false,
      include_raw_content: false,
    };
    if (args.freshness) body.time_range = args.freshness;

    const raw = await requestJson({
      vendor: "tavily",
      url: "https://api.tavily.com/search",
      headers: { authorization: `Bearer ${args.credentials.TAVILY_API_KEY ?? ""}` },
      body,
      signal: args.signal,
      userAgent: args.userAgent,
    });
    const response = ResponseSchema.parse(raw);
    const results = toNormalizedResults(
      "tavily",
      response.results.map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.content,
        date: item.published_date,
      })),
      args.maxResults,
    );

    return { results, costUsd: this.estimateCostUsd(args.mode) };
  },
};
