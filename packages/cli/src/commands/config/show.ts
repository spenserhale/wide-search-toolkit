import { buildCommand } from "@stricli/core";
import { redactedConfig, resolveConfig } from "@wide-search-toolkit/sdk";
import { runCommand } from "../../lib/errors.js";
import { formatFlags, type FormatFlagValues } from "../../lib/flags.js";
import { emit } from "../../lib/output.js";

export const configShowCommand = buildCommand({
  docs: {
    brief: "Show the resolved configuration and where each value came from",
    fullDescription:
      "Secrets are shown as set/missing, never in plain text. The source column distinguishes " +
      "environment variables, project .env files, the user config file, and built-in defaults.",
  },
  parameters: {
    flags: { ...formatFlags },
  },
  async func(this: void, flags: FormatFlagValues) {
    await runCommand(async () => {
      const config = redactedConfig(resolveConfig());
      await emit(config, flags, {
        text: () => JSON.stringify(config, null, 2),
      });
    });
  },
});
