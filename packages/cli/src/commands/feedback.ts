import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildCommand } from "@stricli/core";
import { WideSearchError } from "@wide-search-toolkit/sdk";
import { runCommand } from "../lib/errors.js";
import { formatFlags, type FormatFlagValues } from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { CLI_VERSION } from "../version.js";

export const feedbackCommand = buildCommand({
  docs: {
    brief: "Record feedback locally as JSONL (no network call in v0.1)",
    fullDescription:
      "Writes a timestamped line to ~/.config/wide-search/feedback.jsonl, honoring " +
      "XDG_CONFIG_HOME. It never posts anywhere and never prints the file contents back.",
  },
  parameters: {
    flags: { ...formatFlags },
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Feedback message",
          parse: String,
          placeholder: "text",
        },
      ],
    },
  },
  async func(this: void, flags: FormatFlagValues, text: string) {
    await runCommand(async () => {
      const message = text.trim();
      if (!message) {
        throw new WideSearchError({
          code: "E_VALIDATION",
          message: "feedback text must not be empty",
        });
      }
      const dir = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "wide-search");
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, "feedback.jsonl");
      const timestamp = new Date().toISOString();
      appendFileSync(
        path,
        `${JSON.stringify({ timestamp, version: CLI_VERSION, text: message })}\n`,
        { mode: 0o600 },
      );
      const payload = { stored: true, path, timestamp };
      await emit(payload, flags, {
        text: () => JSON.stringify(payload, null, 2),
      });
    });
  },
});
