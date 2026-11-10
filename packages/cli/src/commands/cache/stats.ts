import { buildCommand } from "@stricli/core";
import { loadConfig, SearchCache } from "@wide-search-toolkit/sdk";
import { runCommand } from "../../lib/errors.js";
import { formatFlags, type FormatFlagValues } from "../../lib/flags.js";
import { emit } from "../../lib/output.js";

function csvEscape(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const cacheStatsCommand = buildCommand({
  docs: {
    brief: "Show the cache directory, entry count, size, and oldest entry age",
  },
  parameters: {
    flags: { ...formatFlags },
  },
  async func(this: void, flags: FormatFlagValues) {
    await runCommand(async () => {
      const config = await loadConfig();
      const cache = new SearchCache({ dir: config.cacheDir, ttlMs: config.cacheTtlMs });
      const stats = cache.stats();
      await emit(stats, flags, {
        text: () => JSON.stringify(stats, null, 2),
        csv: () => {
          const header = "dir,entries,bytes,ttl_ms,oldest_age_ms";
          const row = [stats.dir, stats.entries, stats.bytes, stats.ttl_ms, stats.oldest_age_ms]
            .map(csvEscape)
            .join(",");
          return `${header}\n${row}`;
        },
      });
    });
  },
});
