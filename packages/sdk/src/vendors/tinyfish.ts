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
          position: z.number().optional(),
          site_name: z.string().nullish(),
          title: z.string().nullish(),
          snippet: z.string().nullish(),
          url: z.string(),
          date: z.string().nullish(),
        })
        .passthrough(),
    )
    .default([]),
  total_results: z.number().optional(),
  page: z.number().optional(),
});

const RECENCY_MINUTES = {
  day: 1_440,
  week: 10_080,
  month: 43_200,
  year: 525_600,
} as const;

export const tinyfishAdapter: VendorAdapter = {
  id: "tinyfish",
  label: VENDOR_CATALOG.tinyfish.label,
  maxResults: VENDOR_CATALOG.tinyfish.maxResults,
  supportsFreshness: VENDOR_CATALOG.tinyfish.supportsFreshness,
  catalog: VENDOR_CATALOG.tinyfish,
  estimateCostUsd: (mode) => VENDOR_CATALOG.tinyfish.costUsd[mode],
  async search(args: VendorSearchArgs): Promise<VendorSearchResponse> {
    const url = new URL("https://api.search.tinyfish.ai");
    url.searchParams.set("query", args.query);
    url.searchParams.set("domain_type", "web");
    if (args.freshness) {
      url.searchParams.set("recency_minutes", String(RECENCY_MINUTES[args.freshness]));
    }

    const raw = await requestJson({
      vendor: "tinyfish",
      url: url.toString(),
      method: "GET",
      headers: { "x-api-key": args.credentials.TINYFISH_API_KEY ?? "" },
      signal: args.signal,
      userAgent: args.userAgent,
    });
    const response = ResponseSchema.parse(raw);
    const results = toNormalizedResults(
      "tinyfish",
      response.results.map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        date: item.date,
      })),
      args.maxResults,
    );

    return { results, costUsd: this.estimateCostUsd(args.mode) };
  },
};
