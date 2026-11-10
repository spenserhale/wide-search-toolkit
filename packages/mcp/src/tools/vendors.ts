import type { FastMCP } from "fastmcp";
import {
  listVendorStatusFromConfig,
  loadConfig,
} from "@wide-search-toolkit/sdk";

export function registerVendorTools(server: FastMCP): void {
  server.addTool({
    name: "list_vendors",
    description:
      "List every supported search vendor, whether its credentials are configured, whether it is selected by default, its result limit, freshness support, and estimated cost per call. " +
      "Use before search_wide when you need to know which vendors are available or why a vendor was skipped. Costs are estimates, not invoices.",
    annotations: {
      readOnlyHint: true,
    },
    execute: async () => {
      const config = await loadConfig();
      const vendors = listVendorStatusFromConfig(config);
      const payload = {
        configured: vendors.filter((vendor) => vendor.configured).length,
        vendors,
      };
      return JSON.stringify(payload, null, 2);
    },
  });
}
