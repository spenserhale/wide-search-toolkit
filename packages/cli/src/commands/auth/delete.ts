import { buildCommand } from "@stricli/core";
import { bunSecretStore, WideSearchError } from "@wide-search-toolkit/sdk";
import { deleteCredentials, parseVendorId, selectCredentialKeys } from "../../lib/auth.js";
import { runCommand } from "../../lib/errors.js";
import { formatFlags, type FormatFlagValues } from "../../lib/flags.js";
import { emit } from "../../lib/output.js";
import { dryRunFlag, keyFlag, vendorPositional } from "./shared.js";

interface AuthDeleteFlags extends FormatFlagValues {
  readonly key?: string;
  readonly yes: boolean;
  readonly "dry-run": boolean;
}

export const authDeleteCommand = buildCommand({
  docs: {
    brief: "Remove a vendor key from the OS keychain (requires --yes)",
    fullDescription:
      "Deletes the vendor's keychain entries, or only --key. Keys set through env, .env, or the " +
      "user config file are not touched.",
  },
  parameters: {
    positional: vendorPositional,
    flags: {
      ...keyFlag,
      yes: {
        kind: "boolean",
        brief: "Confirm the deletion",
        default: false,
      },
      ...dryRunFlag,
      ...formatFlags,
    },
  },
  async func(this: void, flags: AuthDeleteFlags, vendorArg: string) {
    await runCommand(async () => {
      const vendor = parseVendorId(vendorArg);
      const keys = selectCredentialKeys(vendor, flags.key);
      if (!flags.yes && !flags["dry-run"]) {
        throw new WideSearchError({
          code: "E_VALIDATION",
          message: "Deleting a keychain entry needs --yes",
          hint: `Preview with --dry-run, then run: wide-search auth delete ${vendor} --yes`,
        });
      }
      const result = await deleteCredentials({
        vendor,
        keys,
        store: bunSecretStore(),
        dryRun: flags["dry-run"],
      });
      await emit(result, flags, {
        text: () =>
          result.credentials.map((row) => `${row.action} ${row.key}`).join("\n"),
      });
    });
  },
});
