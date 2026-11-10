import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bin = join(import.meta.dirname, "..", "src", "bin.ts");
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "wide-search-cli-"));
  dirs.push(dir);
  return dir;
}

function cleanEnv(cwd: string): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: cwd,
    WIDE_SEARCH_KEYCHAIN: "0",
    WIDE_SEARCH_CONFIG_FILE: join(cwd, "missing-config.json"),
  };
  return env;
}

async function runCli(
  args: string[],
  cwd: string,
  stdinText?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", bin, ...args],
    cwd,
    env: cleanEnv(cwd),
    stdin: stdinText === undefined ? "ignore" : new Blob([stdinText]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, stdout, stderr };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("CLI end-to-end", () => {
  it("emits a machine-readable agent context derived from the route tree", async () => {
    const result = await runCli(["agent-context", "--json"], tempDir());
    expect(result.code).toBe(0);
    const context = JSON.parse(result.stdout) as {
      schema_version: string;
      cli: { name: string };
      commands: Record<string, { brief?: string; subcommands?: unknown }>;
    };
    expect(context.schema_version).toBe("1");
    expect(context.cli.name).toBe("wide-search");
    expect(context.commands.search?.brief).toContain("Fan one query");
    expect(context.commands.config?.subcommands).toBeDefined();
  });

  it("lists all vendors with no credentials configured", async () => {
    const result = await runCli(["vendors", "--json"], tempDir());
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      configured: number;
      vendors: Array<{ id: string; configured: boolean }>;
    };
    expect(payload.configured).toBe(0);
    expect(payload.vendors).toHaveLength(9);
    expect(payload.vendors.every((vendor) => vendor.configured === false)).toBe(true);
  });

  it("exits 3 with an enumerated config error when no vendor is configured", async () => {
    const result = await runCli(["search", "hello", "--json"], tempDir());
    expect(result.code).toBe(3);
    expect(result.stderr).toContain("E_CONFIG");
    expect(result.stderr).toContain("No configured search vendors");
  });

  it("rejects two output-format flags", async () => {
    const result = await runCli(["vendors", "--json", "--toon"], tempDir());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Only one output format");
  });

  it("delivers output to an atomic file", async () => {
    const dir = tempDir();
    const output = join(dir, "vendors.json");
    const result = await runCli(
      ["vendors", "--json", "--deliver", `file:${output}`],
      dir,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(readFileSync(output, "utf8")) as {
      vendors: unknown[];
    };
    expect(payload.vendors).toHaveLength(9);
  });

  it("refuses auth set without a terminal unless --stdin is passed", async () => {
    const result = await runCli(["auth", "set", "exa"], tempDir());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--stdin");
  });

  it("refuses auth set --stdin for a two-key vendor without --key", async () => {
    const result = await runCli(["auth", "set", "dataforseo", "--stdin"], tempDir(), "x\n");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--key DATAFORSEO_LOGIN");
  });

  it("previews auth set --stdin --dry-run without writing or echoing the key", async () => {
    const result = await runCli(
      ["auth", "set", "exa", "--stdin", "--dry-run", "--json"],
      tempDir(),
      "dry-run-secret\n",
    );
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.dry_run).toBe(true);
    expect(payload.credentials[0].action).toBe("would_store");
    expect(result.stdout + result.stderr).not.toContain("dry-run-secret");
  });

  it("requires --yes for auth delete", async () => {
    const result = await runCli(["auth", "delete", "exa"], tempDir());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--yes");
  });

  it("rejects an unknown vendor for auth commands", async () => {
    const result = await runCli(["auth", "delete", "bing", "--yes"], tempDir());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unknown vendor");
  });
});
