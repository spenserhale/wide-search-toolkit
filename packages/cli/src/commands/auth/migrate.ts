import { buildCommand } from "@stricli/core";
import { bunSecretStore, loadConfig } from "@wide-search-toolkit/sdk";
import { migrateCredentials } from "../../lib/auth.js";
import { runCommand } from "../../lib/errors.js";
import { formatFlags, type FormatFlagValues } from "../../lib/flags.js";
import { emit } from "../../lib/output.js";
import { dryRunFlag } from "./shared.js";

interface AuthMigrateFlags extends FormatFlagValues {
  readonly overwrite: boolean;
  readonly "dry-run": boolean;
}

export const authMigrateCommand = buildCommand({
  docs: {
    brief: "Copy plaintext keys from .env files and the user config into the keychain",
    fullDescription:
      "Stores every key whose active source is a .env file or ~/.config/wide-search/config.json " +
      "in the OS keychain, skipping keys already there unless --overwrite. Process-environment " +
      "keys (op run, CI) are left alone. Files are not edited: remove the listed clean_up lines " +
      "yourself, because a .env value keeps overriding the keychain until you do.",
  },
  parameters: {
    flags: {
      overwrite: {
        kind: "boolean",
        brief: "Replace keys that already exist in the keychain",
        default: false,
      },
      ...dryRunFlag,
      ...formatFlags,
    },
  },
  async func(this: void, flags: AuthMigrateFlags) {
    await runCommand(async () => {
      const store = bunSecretStore();
      const config = await loadConfig({ secretStore: store });
      const result = await migrateCredentials({
        store,
        config,
        dryRun: flags["dry-run"],
        overwrite: flags.overwrite,
      });
      await emit(result, flags, {
        text: () =>
          [
            ...(result.credentials.length === 0
              ? ["nothing to migrate: no keys come from .env files or the user config"]
              : result.credentials.map((row) => `${row.action} ${row.key} (from ${row.from})`)),
            ...(result.clean_up.length > 0
              ? ["", "remove the migrated keys from:", ...result.clean_up.map((file) => `  ${file}`)]
              : []),
          ].join("\n"),
      });
    });
  },
});
