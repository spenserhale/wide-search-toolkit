import { z } from "zod";
import type { VendorAdapter, VendorSearchArgs, VendorSearchResponse } from "./types.js";
import { requestJson, isoDaysAgo, FRESHNESS_DAYS } from "./http.js";
import { toNormalizedResults } from "./util.js";
import { VENDOR_CATALOG } from "./catalog.js";

const ResponseSchema = z.object({
  results: z
    .array(
      z
        .object({
          title: z.string().nullish(),
          url: z.string(),
          publishedDate: z.string().nullish(),
          highlights: z.array(z.string()).nullish(),
          text: z.string().nullish(),
          summary: z.string().nullish(),
        })
        .passthrough(),
    )
    .default([]),
});

export const exaAdapter: VendorAdapter = {
  id: "exa",
  label: VENDOR_CATALOG.exa.label,
  maxResults: VENDOR_CATALOG.exa.maxResults,
  supportsFreshness: VENDOR_CATALOG.exa.supportsFreshness,
  catalog: VENDOR_CATALOG.exa,
  estimateCostUsd: (mode) => VENDOR_CATALOG.exa.costUsd[mode],
  async search(args: VendorSearchArgs): Promise<VendorSearchResponse> {
    const body: Record<string, unknown> = {
      query: args.query,
      numResults: Math.min(args.maxResults, VENDOR_CATALOG.exa.maxResults),
      type: args.mode === "fast" ? "lite" : "auto",
      contents: { highlights: true },
    };
    if (args.freshness) {
      body.startPublishedDate = isoDaysAgo(FRESHNESS_DAYS[args.freshness]);
    }

    const raw = await requestJson({
      vendor: "exa",
      url: "https://api.exa.ai/search",
      headers: { "x-api-key": args.credentials.EXA_API_KEY ?? "" },
      body,
      signal: args.signal,
      userAgent: args.userAgent,
    });
    const response = ResponseSchema.parse(raw);
    const results = toNormalizedResults(
      "exa",
      response.results.map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.highlights?.[0] ?? item.summary ?? item.text,
        date: item.publishedDate,
      })),
      args.maxResults,
    );

    return { results, costUsd: this.estimateCostUsd(args.mode) };
  },
};
