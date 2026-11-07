import type { OutputFormat } from "@wide-search-toolkit/sdk";
import { OUTPUT_FORMATS } from "@wide-search-toolkit/sdk";

export const formatFlags = {
  format: {
    kind: "enum",
    values: OUTPUT_FORMATS,
    brief: "Output format: toon (agents, default), json (integrations), csv (flat rows)",
    optional: true,
  },
  toon: {
    kind: "boolean",
    brief: "Shortcut for --format toon (default)",
    default: false,
  },
  json: {
    kind: "boolean",
    brief: "Shortcut for --format json",
    default: false,
  },
  csv: {
    kind: "boolean",
    brief: "Shortcut for --format csv (flat result rows only)",
    default: false,
  },
  text: {
    kind: "boolean",
    brief: "Shortcut for --format text (human-readable layout)",
    default: false,
  },
  deliver: {
    kind: "parsed",
    parse: String,
    brief: "Write output to stdout (default) or file:<path>",
    optional: true,
  },
} as const;

export interface FormatFlagValues {
  readonly format?: OutputFormat;
  readonly toon: boolean;
  readonly json: boolean;
  readonly csv: boolean;
  readonly text: boolean;
  readonly deliver?: string;
}

export const vendorFlag = {
  vendor: {
    kind: "parsed",
    parse: String,
    brief: "Restrict to a vendor; repeat the flag for several (default: configured vendors)",
    variadic: true,
    optional: true,
  },
} as const;

export const maxPerVendorFlag = {
  "max-per-vendor": {
    kind: "parsed",
    parse: Number,
    brief: "Max results requested from each vendor (1-20; default: config, 10)",
    optional: true,
  },
} as const;

export const freshnessFlag = {
  freshness: {
    kind: "enum",
    values: ["day", "week", "month", "year"],
    brief: "Restrict to fresh results where the vendor supports it",
    optional: true,
  },
} as const;

export const modeFlag = {
  mode: {
    kind: "enum",
    values: ["fast", "standard"],
    brief: "Vendor speed/quality mode",
    default: "standard",
  },
} as const;

export const budgetFlag = {
  "budget-usd": {
    kind: "parsed",
    parse: Number,
    brief: "Max estimated spend for this call in USD (default: config, 0.05)",
    optional: true,
  },
} as const;

export const limitFlag = {
  limit: {
    kind: "parsed",
    parse: Number,
    brief: "Max merged results to return, 1-100",
    default: "50",
  },
} as const;

export const noCacheFlag = {
  "no-cache": {
    kind: "boolean",
    brief: "Bypass both cache reads and cache writes",
    default: false,
  },
} as const;

export const timeoutFlag = {
  "timeout-ms": {
    kind: "parsed",
    parse: Number,
    brief: "Per-vendor timeout in milliseconds (default: config, 8000)",
    optional: true,
  },
} as const;
