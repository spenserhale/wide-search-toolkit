import { z } from "zod";
import type { VendorAdapter, VendorSearchArgs, VendorSearchResponse } from "./types.js";
import { requestJson } from "./http.js";
import { toNormalizedResults } from "./util.js";
import { VENDOR_CATALOG } from "./catalog.js";
import { WideSearchError } from "../errors.js";

const WebItemSchema = z
  .object({
    title: z.string().nullish(),
    description: z.string().nullish(),
    url: z.string(),
    position: z.number().optional(),
  })
  .passthrough();

const ResponseSchema = z
  .object({
    success: z.boolean().optional(),
    data: z
      .union([
        z.object({ web: z.array(WebItemSchema).default([]) }).passthrough(),
        z.array(WebItemSchema),
      ])
      .optional(),
    error: z.string().optional(),
    warning: z.string().nullish(),
  })
  .passthrough();

const TBS = {
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
} as const;

export const firecrawlAdapter: VendorAdapter = {
  id: "firecrawl",
  label: VENDOR_CATALOG.firecrawl.label,
  maxResults: VENDOR_CATALOG.firecrawl.maxResults,
  supportsFreshness: VENDOR_CATALOG.firecrawl.supportsFreshness,
  catalog: VENDOR_CATALOG.firecrawl,
  estimateCostUsd: (mode) => VENDOR_CATALOG.firecrawl.costUsd[mode],
  async search(args: VendorSearchArgs): Promise<VendorSearchResponse> {
    const body: Record<string, unknown> = {
      query: args.query,
      limit: Math.min(args.maxResults, VENDOR_CATALOG.firecrawl.maxResults),
      sources: ["web"],
    };
    if (args.freshness) body.tbs = TBS[args.freshness];

    const raw = await requestJson({
      vendor: "firecrawl",
      url: "https://api.firecrawl.dev/v2/search",
      headers: { authorization: `Bearer ${args.credentials.FIRECRAWL_API_KEY ?? ""}` },
      body,
      signal: args.signal,
      userAgent: args.userAgent,
    });
    const response = ResponseSchema.parse(raw);
    if (response.success === false) {
      throw new WideSearchError({
        code: "E_NETWORK",
        message: "Firecrawl returned an unsuccessful search",
        got: response.error ?? "unknown error",
      });
    }

    const web = Array.isArray(response.data) ? response.data : (response.data?.web ?? []);
    const results = toNormalizedResults(
      "firecrawl",
      web.map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.description,
      })),
      args.maxResults,
    );

    const warnings = response.warning ? [response.warning] : undefined;
    return { results, costUsd: this.estimateCostUsd(args.mode), warnings };
  },
};
