import type { FastMCP } from "fastmcp";
import { z } from "zod";
import {
  fetchPages,
  loadConfig,
} from "@wide-search-toolkit/sdk";

export function registerFetchTools(server: FastMCP): void {
  server.addTool({
    name: "fetch_pages",
    description:
      "Fetch full page text for up to 20 public HTTP(S) URLs. Use after search_wide when snippets are not enough. " +
      "Returns per-URL status, title, content type, byte count, truncation flags, and extracted text. " +
      "Loopback, private, link-local, multicast, reserved, metadata, and IPv4-mapped IPv6 targets are blocked unless the operator sets WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1; that is a config decision, not a tool argument. " +
      "Per-page and aggregate character caps keep the response bounded.",
    parameters: z.object({
      urls: z
        .array(z.string().url())
        .min(1)
        .max(20)
        .describe("HTTP(S) URLs to fetch"),
      max_chars_per_page: z
        .number()
        .int()
        .min(1_000)
        .max(200_000)
        .default(20_000)
        .describe("Per-page text cap in characters"),
      max_total_chars: z
        .number()
        .int()
        .min(1_000)
        .max(1_000_000)
        .default(100_000)
        .describe("Aggregate text cap across all pages"),
      timeout_ms: z
        .number()
        .int()
        .min(100)
        .max(60_000)
        .default(15_000)
        .describe("Per-URL timeout in milliseconds"),
      concurrency: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(4)
        .describe("Parallel fetches"),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      const config = await loadConfig();
      const report = await fetchPages({
        urls: args.urls,
        maxCharsPerPage: args.max_chars_per_page,
        maxTotalChars: args.max_total_chars,
        timeoutMs: args.timeout_ms,
        concurrency: args.concurrency,
        allowPrivateHosts: config.allowPrivateHosts,
        userAgent: config.userAgent,
      });
      return JSON.stringify(report, null, 2);
    },
  });
}
