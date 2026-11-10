import { VENDOR_IDS } from "@wide-search-toolkit/sdk";

export const vendorPositional = {
  kind: "tuple",
  parameters: [
    {
      brief: `Vendor id: ${VENDOR_IDS.join(", ")}`,
      parse: String,
      placeholder: "vendor",
    },
  ],
} as const;

export const keyFlag = {
  key: {
    kind: "parsed",
    parse: String,
    brief: "Only this credential (e.g. DATAFORSEO_PASSWORD); default: every key the vendor uses",
    optional: true,
  },
} as const;

export const dryRunFlag = {
  "dry-run": {
    kind: "boolean",
    brief: "Validate and report what would change without touching the keychain",
    default: false,
  },
} as const;
