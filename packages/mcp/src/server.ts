import { FastMCP } from "fastmcp";
import { registerSearchTools } from "./tools/search.js";
import { registerFetchTools } from "./tools/fetch.js";
import { registerVendorTools } from "./tools/vendors.js";

export function createServer(): FastMCP {
  const server = new FastMCP({
    name: "wide-search-toolkit",
    version: "0.2.1",
    instructions:
      "Wide-search fans one query out to multiple independent web-search vendors, dedupes by canonical URL, ranks with reciprocal rank fusion, and reports per-vendor status. " +
      "Call search_wide for broad research, vendor-gap analysis, or a result set wider than one index. " +
      "Partial vendor failures are normal; read vendors[] rather than treating an empty result as proof that nothing exists. " +
      "Call fetch_pages only for URLs you actually need to read; it blocks private-network targets by default. " +
      "Costs are estimates, not invoices; the default per-call budget selects configured vendors cheapest-first.",
  });
  registerSearchTools(server);
  registerFetchTools(server);
  registerVendorTools(server);
  return server;
}
