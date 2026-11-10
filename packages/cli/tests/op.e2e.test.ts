import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadOpEnv,
  opE2eEnabled,
  OP_E2E_VENDORS,
} from "../../../tests/e2e/op.js";

const template = join(import.meta.dirname, "..", "..", "..", "tests", "e2e", "op.env.tpl");
const bin = join(import.meta.dirname, "..", "src", "bin.ts");
const dirs: string[] = [];
const describeOp = opE2eEnabled() ? describe : describe.skip;

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "wide-search-op-cli-"));
  dirs.push(home);
  return home;
}

function childEnv(home: string): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    HOME: home,
    WIDE_SEARCH_KEYCHAIN: "0",
    WIDE_SEARCH_CONFIG_FILE: join(home, "missing-config.json"),
    ...loadOpEnv(template),
  };
}

async function runCli(
  args: string[],
  home: string,
  env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn({
    cmd: [process.execPath, "run", bin, ...args],
    cwd: home,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, stdout, stderr };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describeOp("CLI live adapters via op inject", () => {
  it(
    "searches all five 1Password-backed vendors and reports every one as ok",
    async () => {
      const home = tempHome();
      const env = childEnv(home);
      const result = await runCli(
        [
          "search",
          "TypeScript programming language",
          ...OP_E2E_VENDORS.flatMap((vendor) => ["--vendor", vendor]),
          "--max-per-vendor",
          "3",
          "--mode",
          "fast",
          "--budget-usd",
          "1",
          "--limit",
          "20",
          "--no-cache",
          "--json",
        ],
        home,
        env,
      );

      expect(result.code, result.stderr).toBe(0);
      const report = JSON.parse(result.stdout) as {
        all_failed: boolean;
        vendors: Array<{
          vendor: string;
          selected: boolean;
          status: string;
          results: number;
          error?: string;
        }>;
        stats: {
          vendors_selected: number;
          vendors_ok: number;
          vendors_failed: number;
          results_before_dedupe: number;
        };
      };

      expect(report.all_failed).toBe(false);
      expect(report.stats.vendors_selected).toBe(OP_E2E_VENDORS.length);
      expect(report.stats.vendors_ok).toBe(OP_E2E_VENDORS.length);
      expect(report.stats.vendors_failed).toBe(0);
      expect(report.stats.results_before_dedupe).toBeGreaterThanOrEqual(OP_E2E_VENDORS.length);

      for (const vendor of OP_E2E_VENDORS) {
        const row = report.vendors.find((entry) => entry.vendor === vendor);
        expect(row, `missing vendor report for ${vendor}`).toBeDefined();
        expect(row?.selected).toBe(true);
        expect(row?.status, `${vendor} status: ${row?.error ?? "no error"}`).toBe("ok");
        expect(row?.results, `${vendor} returned no results`).toBeGreaterThan(0);
        expect(row?.error).toBeUndefined();
      }
    },
    120_000,
  );

  it("shows the five 1Password-backed vendors as configured", async () => {
    const home = tempHome();
    const result = await runCli(["vendors", "--json"], home, childEnv(home));

    expect(result.code, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      configured: number;
      vendors: Array<{ id: string; configured: boolean }>;
    };
    expect(payload.configured).toBe(OP_E2E_VENDORS.length);
    expect(payload.vendors).toHaveLength(9);
    for (const vendor of OP_E2E_VENDORS) {
      expect(payload.vendors.find((entry) => entry.id === vendor)?.configured).toBe(true);
    }
  }, 60_000);
});
