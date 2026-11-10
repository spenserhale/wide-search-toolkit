#!/usr/bin/env bun
/**
 * Generate wide-search-cli/SKILL.md from the live command tree and agent
 * context. Run `bun run build:skill` after changing a command; the generated
 * file is checked in so agents can read it without running the CLI.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { app } from "../src/app.js";
import { buildAgentContext, REPO } from "../src/agent-context.js";
import { flattenCommands, type CommandDescription } from "../src/lib/introspect.js";
import { CLI_NAME, CLI_VERSION } from "../src/version.js";

const out = resolve(import.meta.dirname, "..", "..", "..", "wide-search-cli", "SKILL.md");
const context = buildAgentContext(app.root);

const DESCRIPTION =
  `Reference for the \`${CLI_NAME}\` CLI (from ${REPO}), which fans one query out to several independent web-search vendors, ` +
  "dedupes by canonical URL, ranks with reciprocal rank fusion, and reports per-vendor status, latency, and estimated cost. " +
  "Trigger whenever the user wants broad web research, multiple search engines compared, vendor-gap or disagreement analysis, " +
  "or a search result set that is wider than one vendor's index — even if they do not name the CLI. " +
  "Prefer it over hand-rolling curl against each vendor: it handles parallel fan-out, timeouts, partial failures, budget selection, and page fetching.";

const SHARED_FLAGS = new Set([
  "--format",
  "--toon",
  "--json",
  "--csv",
  "--text",
  "--deliver",
]);

function flagLine(name: string, flag: NonNullable<CommandDescription["flags"]>[string]): string {
  const values = flag.values ? ` <${flag.values.join("|")}>` : flag.type === "string" ? " <value>" : "";
  const dflt =
    flag.default !== undefined && flag.default !== false ? ` (default ${String(flag.default)})` : "";
  const variadic = flag.variadic ? " (repeatable)" : "";
  return `- \`${name}${values}\`${variadic}${dflt} — ${flag.brief}`;
}

function markdown(): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${CLI_NAME}-cli`);
  lines.push(`description: ${JSON.stringify(DESCRIPTION)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${CLI_NAME} CLI`);
  lines.push("");
  lines.push(`Version ${CLI_VERSION}. ${context.purpose}`);
  lines.push("");
  lines.push("## Start here");
  lines.push("");
  lines.push("```bash");
  lines.push('wide-search search "latest approaches to hybrid retrieval" --json');
  lines.push('wide-search search "topic" --vendor exa --vendor tavily --toon');
  lines.push("wide-search fetch https://example.com/article --json");
  lines.push("wide-search vendors");
  lines.push("wide-search agent-context --json");
  lines.push("```");
  lines.push("");
  lines.push("Run `wide-search agent-context --json` for the full machine-readable surface. It is generated from the live command tree, so it matches `--help`.");
  lines.push("");
  lines.push("## Output");
  lines.push("");
  lines.push(
    `Formats: ${context.output.formats.map((format) => `\`${format}\``).join(", ")}. Default \`${context.output.default}\`; ${context.output.env}. ` +
      "Use `--toon` when you are the consumer (fewest tokens), `--json` for the full report envelope, and `--csv` only for flat rows.",
  );
  lines.push("");
  lines.push(context.output.csv_scope);
  lines.push("");
  lines.push("## Vendor selection and cost");
  lines.push("");
  lines.push(`- ${context.budget.selection}`);
  lines.push(`- Default budget: $${context.budget.default_usd.toFixed(2)} per call. ${context.budget.note}`);
  lines.push("- `--vendor` narrows the candidate set; it does not bypass the budget.");
  lines.push("");
  lines.push("| Vendor | Env keys | Freshness | Max results | Fast $ | Standard $ |");
  lines.push("|---|---|---|---|---|---|");
  for (const vendor of context.vendors) {
    lines.push(
      `| ${vendor.label} (\`${vendor.id}\`) | ${vendor.envKeys.map((key) => `\`${key}\``).join(", ")} | ${vendor.supportsFreshness ? "yes" : "no"} | ${vendor.maxResults} | ${vendor.costUsd.fast.toFixed(4)} | ${vendor.costUsd.standard.toFixed(4)} |`,
    );
  }
  lines.push("");
  lines.push("The per-vendor report in `vendors[]` distinguishes `ok`, `timeout`, `error`, `skipped_budget`, and `skipped_unconfigured`. A skipped vendor is not the same as a vendor that returned zero results.");
  lines.push("");
  lines.push("## Ranking, dedupe, and cache");
  lines.push("");
  lines.push(`- ${context.ranking.fusion} with k=${context.ranking.rrf_k}.`);
  lines.push(`- ${context.ranking.dedupe}`);
  lines.push(`- Tie-break: ${context.ranking.tie_break}.`);
  lines.push(`- ${context.ranking.freshness}`);
  lines.push(`- Cache: ${context.cache.stores}; TTL ${context.cache.default_ttl_ms} ms. ${context.cache.bypass}.`);
  lines.push("");
  lines.push("## Fetching pages");
  lines.push("");
  lines.push(`- \`fetch\` accepts up to ${context.fetch.max_urls} URLs per call.`);
  lines.push(`- Per-page cap ${context.fetch.max_chars_per_page.toLocaleString()} chars; aggregate cap ${context.fetch.max_total_chars.toLocaleString()} chars; per-URL timeout ${context.fetch.timeout_ms.toLocaleString()} ms.`);
  lines.push(`- ${context.fetch.private_hosts}`);
  lines.push("");
  lines.push("## Configuration");
  lines.push("");
  for (const [key, description] of Object.entries(context.environment)) {
    lines.push(`- \`${key}\` — ${description}`);
  }
  lines.push("");
  lines.push("Precedence: process environment > nearest `.env` walking up from cwd > OS keychain (`wide-search auth set`) > `~/.config/wide-search/config.json` > built-in default. `config show` reports the winning source for each value and never prints a secret.");
  lines.push("");
  lines.push("## Exit codes");
  lines.push("");
  const byCode = new Map<number, string[]>();
  for (const [code, exit] of Object.entries(context.exit_codes)) {
    byCode.set(exit, [...(byCode.get(exit) ?? []), code]);
  }
  for (const [exit, codes] of [...byCode.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(`- \`${exit}\` — ${codes.join(", ")}`);
  }
  lines.push("");
  lines.push("Partial vendor failure exits 0. When every selected vendor fails, the CLI exits with the first vendor's code.");
  lines.push("");
  lines.push("## Quirks worth knowing");
  lines.push("");
  for (const quirk of context.quirks) lines.push(`- ${quirk}`);
  lines.push("");
  lines.push("## Shared flags");
  lines.push("");
  lines.push("Most commands accept these; they are omitted from the per-command lists below.");
  lines.push("");
  lines.push("- `--format <toon|json|csv|text>`, `--toon`, `--json`, `--csv`, `--text` — output format");
  lines.push("- `--deliver <stdout|file:<path>>` — write to stdout (default) or an atomic file");
  lines.push("");
  lines.push("## Commands");
  lines.push("");
  for (const { path, command } of flattenCommands(context.commands)) {
    const positional = (command.positional ?? [])
      .map((parameter) => ` <${parameter.name}${parameter.optional ? "?" : ""}>`)
      .join("");
    lines.push(`### \`${CLI_NAME} ${path.join(" ")}${positional}\``);
    lines.push("");
    lines.push(command.description ?? command.brief);
    lines.push("");
    const own = Object.entries(command.flags ?? {}).filter(([name]) => !SHARED_FLAGS.has(name));
    if (own.length > 0) {
      for (const [name, flag] of own) lines.push(flagLine(name, flag));
      lines.push("");
    }
  }
  lines.push("## Install / run");
  lines.push("");
  lines.push("```bash");
  lines.push("bun install");
  lines.push("bun run build");
  lines.push("bash scripts/install.sh          # symlink into ~/.local/bin");
  lines.push("bun run dev:cli -- search \"query\" --json");
  lines.push("```");
  lines.push("");
  lines.push("The generated MCP server uses the same SDK and the same vendor configuration: `bun run dev:mcp` in this repo, or point an MCP host at the built `packages/mcp/dist/index.js`.");
  return lines.join("\n");
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${markdown()}\n`);
console.log(`wrote ${out}`);
