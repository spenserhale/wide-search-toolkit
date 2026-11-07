import { z } from "zod";
import type { VendorAdapter, VendorSearchArgs, VendorSearchResponse } from "./types.js";
import { requestJson } from "./http.js";
import { toNormalizedResults } from "./util.js";
import { VENDOR_CATALOG } from "./catalog.js";

const ResponseSchema = z.object({
  search_result: z
    .array(
      z
        .object({
          title: z.string().nullish(),
          content: z.string().nullish(),
          link: z.string().nullish(),
          publish_date: z.string().nullish(),
        })
        .passthrough(),
    )
    .default([]),
});

const RECENCY = {
  day: "oneDay",
  week: "oneWeek",
  month: "oneMonth",
  year: "oneYear",
} as const;

export const zaiAdapter: VendorAdapter = {
  id: "zai",
  label: VENDOR_CATALOG.zai.label,
  maxResults: VENDOR_CATALOG.zai.maxResults,
  supportsFreshness: VENDOR_CATALOG.zai.supportsFreshness,
  catalog: VENDOR_CATALOG.zai,
  estimateCostUsd: (mode) => VENDOR_CATALOG.zai.costUsd[mode],
  async search(args: VendorSearchArgs): Promise<VendorSearchResponse> {
    const body: Record<string, unknown> = {
      search_engine: "search-prime",
      search_query: args.query,
      count: Math.min(args.maxResults, VENDOR_CATALOG.zai.maxResults),
    };
    if (args.freshness) body.search_recency_filter = RECENCY[args.freshness];

    const raw = await requestJson({
      vendor: "z.ai",
      url: "https://api.z.ai/api/paas/v4/web_search",
      headers: {
        authorization: `Bearer ${args.credentials.ZAI_API_KEY ?? ""}`,
        "accept-language": "en-US,en",
      },
      body,
      signal: args.signal,
      userAgent: args.userAgent,
    });
    const response = ResponseSchema.parse(raw);
    const results = toNormalizedResults(
      "zai",
      response.search_result.map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.content,
        date: item.publish_date,
      })),
      args.maxResults,
    );

    return { results, costUsd: this.estimateCostUsd(args.mode) };
  },
};
