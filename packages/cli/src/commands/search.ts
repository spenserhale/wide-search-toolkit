import { buildCommand } from "@stricli/core";
import {
  FRESHNESS_VALUES,
  searchWide,
  SEARCH_MODES,
  type Freshness,
  type SearchMode,
} from "@wide-search-toolkit/sdk";
import { runCommand, exitCodeForSearchReport } from "../lib/errors.js";
import {
  budgetFlag,
  formatFlags,
  freshnessFlag,
  limitFlag,
  maxPerVendorFlag,
  modeFlag,
  noCacheFlag,
  timeoutFlag,
  vendorFlag,
  type FormatFlagValues,
} from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { renderSearchCsv, renderSearchText } from "../lib/render.js";

interface SearchFlags extends FormatFlagValues {
  readonly vendor?: readonly string[];
  readonly "max-per-vendor"?: number;
  readonly freshness?: Freshness;
  readonly mode: SearchMode;
  readonly "budget-usd"?: number;
  readonly limit: number;
  readonly "no-cache": boolean;
  readonly "timeout-ms"?: number;
}

export const searchCommand = buildCommand({
  docs: {
    brief: "Fan one query out to multiple search vendors and merge the results",
    fullDescription:
      "Calls every configured vendor in parallel (or only the vendors named with --vendor), " +
      "normalizes and dedupes by canonical URL, ranks with reciprocal rank fusion, and reports " +
      "each vendor's status, latency, and estimated cost. Partial vendor failures are normal; " +
      "inspect vendors[] rather than assuming an empty result means the web had nothing.",
  },
  parameters: {
    flags: {
      ...vendorFlag,
      ...maxPerVendorFlag,
      ...freshnessFlag,
      ...modeFlag,
      ...budgetFlag,
      ...limitFlag,
      ...noCacheFlag,
      ...timeoutFlag,
      ...formatFlags,
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Natural-language search query",
          parse: String,
          placeholder: "query",
        },
      ],
    },
  },
  async func(this: void, flags: SearchFlags, query: string) {
    await runCommand(async () => {
      const mode = parseMode(flags.mode);
      const freshness = parseFreshness(flags.freshness);
      const report = await searchWide({
        query,
        ...(flags.vendor && flags.vendor.length > 0 ? { vendors: flags.vendor } : {}),
        ...(flags["max-per-vendor"] !== undefined
          ? { maxPerVendor: flags["max-per-vendor"] }
          : {}),
        ...(freshness ? { freshness } : {}),
        mode,
        ...(flags["budget-usd"] !== undefined ? { budgetUsd: flags["budget-usd"] } : {}),
        limit: flags.limit,
        cache: !flags["no-cache"],
        ...(flags["timeout-ms"] !== undefined ? { timeoutMs: flags["timeout-ms"] } : {}),
      });

      await emit(report, flags, {
        text: () => renderSearchText(report),
        csv: () => renderSearchCsv(report),
      });

      const exitCode = exitCodeForSearchReport(report);
      if (exitCode !== 0) {
        process.stderr.write(
          "error: every selected vendor failed; see the vendor report in the output above\n",
        );
        process.exit(exitCode);
      }
    });
  },
});

function parseMode(value: string): SearchMode {
  if (!(SEARCH_MODES as readonly string[]).includes(value)) {
    throw new Error(`mode must be one of ${SEARCH_MODES.join(", ")} (got: "${value}")`);
  }
  return value as SearchMode;
}

function parseFreshness(value: string | undefined): Freshness | undefined {
  if (!value) return undefined;
  if (!(FRESHNESS_VALUES as readonly string[]).includes(value)) {
    throw new Error(
      `freshness must be one of ${FRESHNESS_VALUES.join(", ")} (got: "${value}")`,
    );
  }
  return value as Freshness;
}
