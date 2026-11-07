import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const OP_E2E_ENV_FLAG = "WIDE_SEARCH_OP_E2E";

export const OP_E2E_KEYS = [
  "EXA_API_KEY",
  "TAVILY_API_KEY",
  "PARALLEL_API_KEY",
  "FIRECRAWL_API_KEY",
  "TINYFISH_API_KEY",
] as const;

export const OP_E2E_VENDORS = ["exa", "tavily", "parallel", "firecrawl", "tinyfish"] as const;

export function opE2eEnabled(): boolean {
  return process.env[OP_E2E_ENV_FLAG] === "1";
}

/**
 * Render `op://` references with `op inject` and keep the values in memory.
 * The template contains references only; the rendered output is never written
 * to disk or logged. Errors intentionally omit stdout because it may contain
 * secrets.
 */
export function loadOpEnv(templatePath: string): Record<string, string> {
  // Read first so a missing template fails before invoking 1Password.
  readFileSync(templatePath, "utf8");

  let rendered: string;
  try {
    rendered = execFileSync("op", ["inject", "-i", templatePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    throw new Error(
      `op inject failed${code ? ` (${code})` : ""}. Unlock 1Password and run \`op signin\` in this shell, then retry. ` +
        "Do not paste API keys into chat or a file.",
    );
  }

  const env: Record<string, string> = {};
  for (const rawLine of rendered.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
    env[key] = line.slice(equals + 1);
  }

  const missing = OP_E2E_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `op inject did not render required keys: ${missing.join(", ")}. ` +
        "Check the item names and field labels in tests/e2e/op.env.tpl.",
    );
  }
  return env;
}
