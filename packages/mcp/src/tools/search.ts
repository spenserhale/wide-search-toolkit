import type { FastMCP } from "fastmcp";
import { z } from "zod";
import {
  FRESHNESS_VALUES,
  SEARCH_MODES,
  searchWide,
  VENDOR_IDS,
} from "@wide-search-toolkit/sdk";

export function registerSearchTools(server: FastMCP): void {
  server.addTool({
    name: "search_wide",
    description:
      "Search the web across multiple independent vendors in one call. Use for broad research, vendor-gap analysis, or any question where one search index may be incomplete. " +
      "Returns merged results ranked by reciprocal rank fusion, plus a per-vendor report with status (ok/timeout/error/skipped), latency, and estimated cost. " +
      "Partial vendor failure is normal and still returns useful results; read vendors[] instead of assuming an empty result means nothing exists. " +
      "Snippets only by default; call fetch_pages for full page text. Costs are estimates, not invoices.",
    parameters: z.object({
      query: z.string().min(1).describe("Natural-language search query"),
      vendors: z
        .array(z.enum(VENDOR_IDS))
        .optional()
        .describe("Restrict to these vendors; omit to use every configured vendor"),
      max_per_vendor: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(10)
        .describe("Maximum results requested from each vendor"),
      freshness: z
        .enum(FRESHNESS_VALUES)
        .optional()
        .describe("Restrict to fresh results where the vendor supports it"),
      mode: z
        .enum(SEARCH_MODES)
        .default("standard")
        .describe("fast for latency/cost, standard for quality"),
      budget_usd: z
        .number()
        .nonnegative()
        .optional()
        .describe("Maximum estimated spend for this call (default: config, 0.05)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Maximum merged results to return"),
      no_cache: z
        .boolean()
        .default(false)
        .describe("Bypass both cache reads and cache writes"),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      const report = await searchWide({
        query: args.query,
        ...(args.vendors && args.vendors.length > 0 ? { vendors: args.vendors } : {}),
        maxPerVendor: args.max_per_vendor,
        ...(args.freshness ? { freshness: args.freshness } : {}),
        mode: args.mode,
        ...(args.budget_usd !== undefined ? { budgetUsd: args.budget_usd } : {}),
        limit: args.limit,
        cache: !args.no_cache,
      });
      return JSON.stringify(report, null, 2);
    },
  });
}
