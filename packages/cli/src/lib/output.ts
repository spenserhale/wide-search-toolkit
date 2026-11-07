import { encode } from "@toon-format/toon";
import {
  OUTPUT_FORMATS,
  WideSearchError,
  type OutputFormat,
} from "@wide-search-toolkit/sdk";
import { deliverText } from "./deliver.js";
import type { FormatFlagValues } from "./flags.js";

export { OUTPUT_FORMATS };
export type { OutputFormat };

export interface Renderers {
  /** Human-readable layout. */
  text?: () => string;
  /** Flat CSV rows. Commands with nested output omit this and refuse --csv. */
  csv?: () => string;
}

export function isOutputFormat(value: unknown): value is OutputFormat {
  return typeof value === "string" && (OUTPUT_FORMATS as readonly string[]).includes(value);
}

/**
 * Precedence: explicit --format or one shortcut flag, then WIDE_SEARCH_OUTPUT,
 * then toon. Supplying two formats is a validation error rather than a
 * silently arbitrary winner.
 */
export function resolveFormat(
  flags: FormatFlagValues,
  env: Record<string, string | undefined> = process.env,
): OutputFormat {
  const picked = new Set<OutputFormat>();
  if (flags.format) picked.add(flags.format);
  for (const format of OUTPUT_FORMATS) {
    if (flags[format]) picked.add(format);
  }
  if (picked.size > 1) {
    throw new WideSearchError({
      code: "E_VALIDATION",
      message: "Only one output format may be set",
      got: [...picked].join(", "),
      validValues: OUTPUT_FORMATS,
      hint: "Use --format <toon|json|csv>, or exactly one of --toon / --json / --csv.",
    });
  }
  const fromFlags = [...picked][0];
  if (fromFlags) return fromFlags;

  const fromEnv = env.WIDE_SEARCH_OUTPUT?.toLowerCase();
  if (fromEnv) {
    if (!isOutputFormat(fromEnv)) {
      throw new WideSearchError({
        code: "E_CONFIG",
        message: "WIDE_SEARCH_OUTPUT is not a known format",
        got: fromEnv,
        validValues: OUTPUT_FORMATS,
      });
    }
    return fromEnv;
  }
  return "toon";
}

export function renderOutput(
  data: unknown,
  format: OutputFormat,
  renderers: Renderers,
): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2);
    case "toon":
      return encode(data);
    case "csv":
      if (!renderers.csv) {
        throw new WideSearchError({
          code: "E_VALIDATION",
          message: "CSV output is not available for this command",
          hint: "Use --json or --toon; CSV is reserved for flat result or page rows.",
        });
      }
      return renderers.csv();
    case "text":
      return renderers.text ? renderers.text() : JSON.stringify(data, null, 2);
  }
}

export async function emit(
  data: unknown,
  flags: FormatFlagValues,
  renderers: Renderers,
): Promise<OutputFormat> {
  const format = resolveFormat(flags);
  const payload = renderOutput(data, format, renderers);
  await deliverText(payload, flags.deliver);
  return format;
}
