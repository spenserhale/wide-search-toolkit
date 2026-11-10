import { buildCommand } from "@stricli/core";
import { bunSecretStore, loadConfig, WideSearchError } from "@wide-search-toolkit/sdk";
import { parseVendorId, selectCredentialKeys, setCredentials } from "../../lib/auth.js";
import { runCommand } from "../../lib/errors.js";
import { formatFlags, type FormatFlagValues } from "../../lib/flags.js";
import { emit } from "../../lib/output.js";
import { promptHidden, readAllStdin, stdinIsInteractive } from "../../lib/prompt.js";
import { dryRunFlag, keyFlag, vendorPositional } from "./shared.js";

interface AuthSetFlags extends FormatFlagValues {
  readonly key?: string;
  readonly stdin: boolean;
  readonly "dry-run": boolean;
}

export const authSetCommand = buildCommand({
  docs: {
    brief: "Store a vendor key in the OS keychain (hidden prompt, or --stdin)",
    fullDescription:
      "Saves the key under keychain service `wide-search`, named by its env var (e.g. EXA_API_KEY). " +
      "On a terminal it prompts with hidden input. For scripts and agents, pipe the value with " +
      "--stdin (one key per call; use --key for vendors with two keys such as DataForSEO). The key " +
      "is never accepted as an argument, so it stays out of shell history and process listings. " +
      "Env vars and .env files still take precedence over the keychain; the output flags a stored " +
      "key that one of them shadows.",
  },
  parameters: {
    positional: vendorPositional,
    flags: {
      ...keyFlag,
      stdin: {
        kind: "boolean",
        brief: "Read the key from stdin instead of prompting (non-interactive)",
        default: false,
      },
      ...dryRunFlag,
      ...formatFlags,
    },
  },
  async func(this: void, flags: AuthSetFlags, vendorArg: string) {
    await runCommand(async () => {
      const vendor = parseVendorId(vendorArg);
      const keys = selectCredentialKeys(vendor, flags.key);

      let readValue: (key: string) => Promise<string>;
      if (flags.stdin) {
        if (keys.length > 1) {
          throw new WideSearchError({
            code: "E_VALIDATION",
            message: `${vendor} uses ${keys.length} keys; --stdin stores one per call`,
            validValues: keys,
            hint: `Run once per key: ... | wide-search auth set ${vendor} --key ${keys[0]} --stdin`,
          });
        }
        const piped = await readAllStdin();
        readValue = async () => piped;
      } else {
        if (!stdinIsInteractive()) {
          throw new WideSearchError({
            code: "E_VALIDATION",
            message: "No terminal to prompt on",
            hint: `Pipe the key instead: ... | wide-search auth set ${vendor} --stdin`,
          });
        }
        readValue = (key) => promptHidden(`${key}: `);
      }

      const config = await loadConfig({ secretStore: null });
      const result = await setCredentials({
        vendor,
        keys,
        readValue,
        store: bunSecretStore(),
        config,
        dryRun: flags["dry-run"],
      });
      await emit(result, flags, {
        text: () =>
          result.credentials
            .map(
              (credential) =>
                `${credential.action} ${credential.key} in ${result.store}` +
                (credential.shadowed_by
                  ? ` (warning: ${credential.shadowed_by} still overrides it)`
                  : ""),
            )
            .join("\n"),
      });
    });
  },
});
