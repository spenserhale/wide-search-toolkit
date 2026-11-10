import { buildCommand } from "@stricli/core";
import {
  listVendorStatusFromConfig,
  loadConfig,
  type VendorStatus,
} from "@wide-search-toolkit/sdk";
import { runCommand } from "../lib/errors.js";
import { formatFlags, type FormatFlagValues } from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { renderVendorsText } from "../lib/render.js";

function csvRow(vendor: VendorStatus): string {
  return [
    vendor.id,
    vendor.label,
    vendor.configured,
    vendor.selected_by_default,
    vendor.supportsFreshness,
    vendor.maxResults,
    vendor.costUsd.fast,
    vendor.costUsd.standard,
    vendor.envKeys.join("|"),
  ]
    .map((value) => {
      const text = String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(",");
}

export const vendorsCommand = buildCommand({
  docs: {
    brief: "List the vendor catalog, credentials, capabilities, and estimated costs",
    fullDescription:
      "Shows every supported vendor, whether its keys are configured, whether it is selected " +
      "by default, the maximum results per call, freshness support, and the estimated cost. " +
      "Costs are estimates, not vendor invoices.",
  },
  parameters: {
    flags: { ...formatFlags },
  },
  async func(this: void, flags: FormatFlagValues) {
    await runCommand(async () => {
      const config = await loadConfig();
      const vendors = listVendorStatusFromConfig(config);
      const payload = {
        configured: vendors.filter((vendor) => vendor.configured).length,
        vendors,
      };
      await emit(payload, flags, {
        text: () => renderVendorsText(vendors),
        csv: () => {
          const header =
            "vendor,label,configured,selected_by_default,supports_freshness,max_results,cost_fast_usd,cost_standard_usd,env_keys";
          return [header, ...vendors.map(csvRow)].join("\n");
        },
      });
    });
  },
});
