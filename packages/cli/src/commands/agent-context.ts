import { buildCommand } from "@stricli/core";
import { formatFlags, type FormatFlagValues } from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { runCommand } from "../lib/errors.js";
import { buildAgentContext } from "../agent-context.js";

export const agentContextCommand = buildCommand({
  docs: {
    brief: "Emit a machine-readable description of every command, flag, error code, and vendor",
    fullDescription:
      "Defaults to JSON (use --toon or --text to override). Derived from the live Stricli route " +
      "tree, so it stays in sync with --help. Pipe it to an agent before driving this CLI.",
  },
  parameters: { flags: { ...formatFlags } },
  async func(this: void, flags: FormatFlagValues) {
    await runCommand(async () => {
      const { app } = await import("../app.js");
      const context = buildAgentContext(app.root);
      const effective: FormatFlagValues =
        flags.format || flags.toon || flags.json || flags.csv || flags.text
          ? flags
          : { ...flags, json: true };
      await emit(context, effective, {
        text: () => JSON.stringify(context, null, 2),
      });
    });
  },
});
