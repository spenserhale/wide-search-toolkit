import { buildCommand } from "@stricli/core";
import { resolveConfig, SearchCache } from "@wide-search-toolkit/sdk";
import { runCommand } from "../../lib/errors.js";
import { formatFlags, type FormatFlagValues } from "../../lib/flags.js";
import { emit } from "../../lib/output.js";

export const cacheClearCommand = buildCommand({
  docs: {
    brief: "Delete every cached search aggregate",
    fullDescription:
      "Removes the search-cache JSON files for the current cache directory. The cache stores " +
      "only complete successful aggregates, so clearing it only forces fresh vendor calls.",
  },
  parameters: {
    flags: { ...formatFlags },
  },
  async func(this: void, flags: FormatFlagValues) {
    await runCommand(async () => {
      const config = resolveConfig();
      const cache = new SearchCache({ dir: config.cacheDir, ttlMs: config.cacheTtlMs });
      const cleared = cache.clear();
      const payload = { cleared, dir: cache.directory };
      await emit(payload, flags, {
        text: () => JSON.stringify(payload, null, 2),
      });
    });
  },
});
