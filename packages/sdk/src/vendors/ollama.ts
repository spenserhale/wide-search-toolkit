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
        })
        .passthrough(),
    )
    .default([]),
});

export const ollamaAdapter: VendorAdapter = {
  id: "ollama",
  label: VENDOR_CATALOG.ollama.label,
  maxResults: VENDOR_CATALOG.ollama.maxResults,
  supportsFreshness: VENDOR_CATALOG.ollama.supportsFreshness,
  catalog: VENDOR_CATALOG.ollama,
  estimateCostUsd: (mode) => VENDOR_CATALOG.ollama.costUsd[mode],
  async search(args: VendorSearchArgs): Promise<VendorSearchResponse> {
    const body = {
      query: args.query,
      max_results: Math.min(args.maxResults, VENDOR_CATALOG.ollama.maxResults),
    };

    const raw = await requestJson({
      vendor: "ollama",
      url: "https://ollama.com/api/web_search",
      headers: { authorization: `Bearer ${args.credentials.OLLAMA_API_KEY ?? ""}` },
      body,
      signal: args.signal,
      userAgent: args.userAgent,
    });
    const response = ResponseSchema.parse(raw);
    const results = toNormalizedResults(
      "ollama",
      response.results.map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.content,
      })),
      args.maxResults,
    );

    const warnings = args.freshness
      ? ["Ollama web search does not support freshness filtering."]
      : undefined;
    return { results, costUsd: this.estimateCostUsd(args.mode), warnings };
  },
};
