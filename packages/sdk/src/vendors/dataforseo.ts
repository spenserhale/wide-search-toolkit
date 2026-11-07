import { z } from "zod";
import type { VendorAdapter, VendorSearchArgs, VendorSearchResponse } from "./types.js";
import { requestJson } from "./http.js";
import { toNormalizedResults } from "./util.js";
import { VENDOR_CATALOG } from "./catalog.js";
import { WideSearchError } from "../errors.js";

const ItemSchema = z
  .object({
    type: z.string().optional(),
    title: z.string().optional(),
    url: z.string().optional(),
    description: z.string().optional(),
    rank_absolute: z.number().optional(),
    rank_group: z.number().optional(),
    timestamp: z.string().optional(),
    date: z.string().optional(),
  })
  .passthrough();

const ResponseSchema = z
  .object({
    status_code: z.number().optional(),
    status_message: z.string().optional(),
    tasks: z
      .array(
        z
          .object({
            status_code: z.number().optional(),
            status_message: z.string().optional(),
            result: z
              .array(
                z
                  .object({
                    items: z.array(ItemSchema).optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export const dataForSeoAdapter: VendorAdapter = {
  id: "dataforseo",
  label: VENDOR_CATALOG.dataforseo.label,
  maxResults: VENDOR_CATALOG.dataforseo.maxResults,
  supportsFreshness: VENDOR_CATALOG.dataforseo.supportsFreshness,
  catalog: VENDOR_CATALOG.dataforseo,
  estimateCostUsd: (mode) => VENDOR_CATALOG.dataforseo.costUsd[mode],
  async search(args: VendorSearchArgs): Promise<VendorSearchResponse> {
    const login = args.credentials.DATAFORSEO_LOGIN ?? "";
    const password = args.credentials.DATAFORSEO_PASSWORD ?? "";
    const authorization = `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;

    const body = [
      {
        keyword: args.query,
        location_code: 2840,
        language_code: "en",
        depth: Math.min(args.maxResults, VENDOR_CATALOG.dataforseo.maxResults),
        device: "desktop",
      },
    ];

    const raw = await requestJson({
      vendor: "dataforseo",
      url: "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
      headers: { authorization },
      body,
      signal: args.signal,
      userAgent: args.userAgent,
    });
    const response = ResponseSchema.parse(raw);
    if (response.status_code !== undefined && response.status_code !== 20000) {
      throw new WideSearchError({
        code: "E_NETWORK",
        message: "DataForSEO returned an error",
        got: response.status_message ?? String(response.status_code),
      });
    }
    const task = response.tasks[0];
    if (!task) {
      throw new WideSearchError({
        code: "E_NETWORK",
        message: "DataForSEO returned no task",
      });
    }
    if (task.status_code !== undefined && task.status_code !== 20000) {
      throw new WideSearchError({
        code: "E_NETWORK",
        message: "DataForSEO task failed",
        got: task.status_message ?? String(task.status_code),
      });
    }

    const items = (task.result?.[0]?.items ?? []).filter(
      (item) => item.type === "organic" && item.url,
    );
    const results = toNormalizedResults(
      "dataforseo",
      items.map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.description,
        date: item.timestamp ?? item.date,
      })),
      args.maxResults,
    );

    const warnings = args.freshness
      ? ["DataForSEO does not support freshness filtering in this adapter; results are unfiltered."]
      : undefined;
    return { results, costUsd: this.estimateCostUsd(args.mode), warnings };
  },
};
