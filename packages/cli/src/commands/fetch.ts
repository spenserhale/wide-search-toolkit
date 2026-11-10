import { buildCommand } from "@stricli/core";
import { fetchPages, loadConfig, WideSearchError } from "@wide-search-toolkit/sdk";
import { exitCodeForFetchReport, runCommand } from "../lib/errors.js";
import { formatFlags, type FormatFlagValues } from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { renderFetchCsv, renderFetchText } from "../lib/render.js";
import { parsePositiveInt } from "../lib/parse.js";

interface FetchFlags extends FormatFlagValues {
  readonly url?: readonly string[];
  readonly "max-chars-per-page"?: number;
  readonly "max-total-chars"?: number;
  readonly "timeout-ms"?: number;
  readonly concurrency?: number;
}

export const fetchCommand = buildCommand({
  docs: {
    brief: "Fetch full page text for one or more public URLs",
    fullDescription:
      "Fetches HTTP(S) pages with a per-page and aggregate text cap. Loopback, private, " +
      "link-local, multicast, reserved, metadata, and IPv4-mapped IPv6 destinations are " +
      "blocked unless WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1 is set explicitly.",
  },
  parameters: {
    flags: {
      url: {
        kind: "parsed",
        parse: String,
        brief: "Additional URL to fetch; repeat the flag for several",
        variadic: true,
        optional: true,
      },
      "max-chars-per-page": {
        kind: "parsed",
        parse: Number,
        brief: "Per-page text cap (default: config, 20000)",
        optional: true,
      },
      "max-total-chars": {
        kind: "parsed",
        parse: Number,
        brief: "Aggregate text cap across all pages (default: config, 100000)",
        optional: true,
      },
      "timeout-ms": {
        kind: "parsed",
        parse: Number,
        brief: "Per-URL timeout in milliseconds (default: config, 15000)",
        optional: true,
      },
      concurrency: {
        kind: "parsed",
        parse: parsePositiveInt,
        brief: "Parallel fetches, 1-10 (default: config, 4)",
        optional: true,
      },
      ...formatFlags,
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "URL to fetch",
          parse: String,
          placeholder: "url",
          optional: true,
        },
      ],
    },
  },
  async func(this: void, flags: FetchFlags, positionalUrl?: string) {
    await runCommand(async () => {
      const config = await loadConfig();
      const urls = [positionalUrl, ...(flags.url ?? [])].filter(
        (url): url is string => typeof url === "string" && url.trim().length > 0,
      );
      if (urls.length === 0) {
        throw new WideSearchError({
          code: "E_VALIDATION",
          message: "fetch needs at least one URL",
          hint: "Pass a URL positionally or repeat --url.",
        });
      }

      const report = await fetchPages({
        urls,
        maxCharsPerPage: flags["max-chars-per-page"] ?? config.fetchMaxChars,
        maxTotalChars: flags["max-total-chars"] ?? config.fetchTotalMaxChars,
        timeoutMs: flags["timeout-ms"] ?? config.fetchTimeoutMs,
        concurrency: flags.concurrency ?? config.fetchConcurrency,
        allowPrivateHosts: config.allowPrivateHosts,
        userAgent: config.userAgent,
      });

      await emit(report, flags, {
        text: () => renderFetchText(report),
        csv: () => renderFetchCsv(report),
      });

      const exitCode = exitCodeForFetchReport(report);
      if (exitCode !== 0) {
        process.stderr.write("error: every URL failed; see the page report in the output above\n");
        process.exit(exitCode);
      }
    });
  },
});
