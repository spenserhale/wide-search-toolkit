import { buildCommand } from "@stricli/core";
import { bunSecretStore, loadConfig } from "@wide-search-toolkit/sdk";
import { csvCell, listCredentials } from "../../lib/auth.js";
import { runCommand } from "../../lib/errors.js";
import { formatFlags, type FormatFlagValues } from "../../lib/flags.js";
import { emit } from "../../lib/output.js";

export const authListCommand = buildCommand({
  docs: {
    brief: "Show which vendor keys are in the keychain and which source is active",
    fullDescription:
      "Lists every credential key with its keychain state (set/missing) and the source that " +
      "currently wins (env, envfile:<path>, keychain, config:<path>, or missing). Values are " +
      "never printed.",
  },
  parameters: {
    flags: { ...formatFlags },
  },
  async func(this: void, flags: FormatFlagValues) {
    await runCommand(async () => {
      const store = bunSecretStore();
      const config = await loadConfig({ secretStore: store });
      const result = await listCredentials(store, config);
      await emit(result, flags, {
        text: () =>
          [
            `store: ${result.store} (${result.keychain_status})`,
            ...result.credentials.map(
              (row) =>
                `${row.key.padEnd(22)} keychain=${row.keychain.padEnd(7)} active=${row.active_source}`,
            ),
          ].join("\n"),
        csv: () =>
          [
            "vendor,key,keychain,active_source",
            ...result.credentials.map((row) =>
              [row.vendor, row.key, row.keychain, row.active_source].map(csvCell).join(","),
            ),
          ].join("\n"),
      });
    });
  },
});
