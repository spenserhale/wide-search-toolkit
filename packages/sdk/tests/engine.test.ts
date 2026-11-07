import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SearchCache } from "../src/cache.js";
import { searchWide } from "../src/engine.js";
import { WideSearchError } from "../src/errors.js";
import { fakeAdapter, makeConfig, result } from "./helpers.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "wide-search-engine-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("searchWide", () => {
  it("merges overlapping results from multiple vendors", async () => {
    const config = makeConfig({ vendors: ["exa", "tavily"] });
    const report = await searchWide(
      { query: "hello", cache: false },
      {
        config,
        adapters: {
          exa: fakeAdapter("exa", [
            result("exa", 1, "https://consensus.example.com/"),
            result("exa", 2, "https://exa-only.example.com/"),
          ]),
          tavily: fakeAdapter("tavily", [
            result("tavily", 1, "https://consensus.example.com/"),
          ]),
        },
      },
    );

    expect(report.results[0]?.url).toBe("https://consensus.example.com/");
    expect(report.results[0]?.found_by).toBe(2);
    expect(report.vendors).toHaveLength(2);
    expect(report.stats.vendors_ok).toBe(2);
    expect(report.all_failed).toBe(false);
  });

  it("selects configured vendors cheapest-first within the budget", async () => {
    const config = makeConfig({
      vendors: ["exa", "parallel"],
      credentials: {
        ...makeConfig().credentials,
        parallel: { PARALLEL_API_KEY: "parallel-key" },
      },
      budgetUsd: 0.001,
    });

    const report = await searchWide(
      { query: "budget", budgetUsd: 0.001, mode: "fast", cache: false },
      {
        config,
        adapters: {
          exa: fakeAdapter("exa", [result("exa", 1, "https://exa.example.com/")], {
            costUsd: 0.005,
          }),
          parallel: fakeAdapter(
            "parallel",
            [result("parallel", 1, "https://parallel.example.com/")],
            { costUsd: 0.001 },
          ),
        },
      },
    );

    const exa = report.vendors.find((vendor) => vendor.vendor === "exa");
    const parallel = report.vendors.find((vendor) => vendor.vendor === "parallel");
    expect(exa?.status).toBe("skipped_budget");
    expect(exa?.selected).toBe(false);
    expect(parallel?.status).toBe("ok");
    expect(report.hints.some((hint) => hint.includes("Budget"))).toBe(true);
  });

  it("rejects a budget below the cheapest configured vendor", async () => {
    const config = makeConfig({ vendors: ["exa"], budgetUsd: 0 });
    await expect(
      searchWide(
        { query: "no budget", budgetUsd: 0, cache: false },
        { config, adapters: { exa: fakeAdapter("exa", []) } },
      ),
    ).rejects.toBeInstanceOf(WideSearchError);
  });

  it("returns partial results when one vendor fails", async () => {
    const config = makeConfig({ vendors: ["exa", "tavily"] });
    const report = await searchWide(
      { query: "partial", cache: false },
      {
        config,
        adapters: {
          exa: fakeAdapter("exa", [], {
            throwError: new WideSearchError({ code: "E_AUTH", message: "bad key" }),
          }),
          tavily: fakeAdapter("tavily", [
            result("tavily", 1, "https://tavily.example.com/"),
          ]),
        },
      },
    );

    expect(report.all_failed).toBe(false);
    expect(report.stats.vendors_ok).toBe(1);
    expect(report.stats.vendors_failed).toBe(1);
    expect(report.results).toHaveLength(1);
    expect(report.hints.some((hint) => hint.includes("Partial results"))).toBe(true);
  });

  it("marks a report when every selected vendor fails", async () => {
    const config = makeConfig({ vendors: ["exa", "tavily"] });
    const report = await searchWide(
      { query: "all fail", cache: false },
      {
        config,
        adapters: {
          exa: fakeAdapter("exa", [], {
            throwError: new WideSearchError({ code: "E_NETWORK", message: "down" }),
          }),
          tavily: fakeAdapter("tavily", [], {
            throwError: new WideSearchError({ code: "E_TIMEOUT", message: "slow" }),
          }),
        },
      },
    );

    expect(report.all_failed).toBe(true);
    expect(report.results).toHaveLength(0);
    expect(report.vendors.find((vendor) => vendor.vendor === "tavily")?.status).toBe("timeout");
    expect(report.hints.some((hint) => hint.includes("All selected vendors failed"))).toBe(true);
  });

  it("reports configured vendors that are missing credentials", async () => {
    const config = makeConfig({
      vendors: ["exa", "perplexity"],
      credentials: {
        ...makeConfig().credentials,
        perplexity: {},
      },
    });
    const report = await searchWide(
      { query: "unconfigured", cache: false },
      { config, adapters: { exa: fakeAdapter("exa", [result("exa", 1, "https://exa.example.com/")]) } },
    );

    const perplexity = report.vendors.find((vendor) => vendor.vendor === "perplexity");
    expect(perplexity?.status).toBe("skipped_unconfigured");
    expect(perplexity?.reason).toContain("PERPLEXITY_API_KEY");
  });

  it("serves a complete successful report from cache without repeating vendor calls", async () => {
    const dir = tempDir();
    let now = 1_000;
    let calls = 0;
    const config = makeConfig({
      vendors: ["exa"],
      cacheTtlMs: 60_000,
      cacheDir: dir,
    });
    const adapter = fakeAdapter("exa", [result("exa", 1, "https://cache.example.com/")]);
    const wrapped = {
      ...adapter,
      async search(args: Parameters<typeof adapter.search>[0]) {
        calls += 1;
        return adapter.search(args);
      },
    };
    const cache = new SearchCache({ dir, ttlMs: 60_000, now: () => now });

    const first = await searchWide(
      { query: "cache me" },
      { config, adapters: { exa: wrapped }, cache, now: () => now },
    );
    expect(first.cache.stored).toBe(true);
    expect(calls).toBe(1);

    now = 2_000;
    const second = await searchWide(
      { query: "cache me" },
      { config, adapters: { exa: wrapped }, cache, now: () => now },
    );
    expect(second.cache.hit).toBe(true);
    expect(second.stats.estimated_cost_usd).toBe(0);
    expect(second.vendors[0]?.cached).toBe(true);
    expect(calls).toBe(1);
  });

  it("does not cache a partial aggregate", async () => {
    const dir = tempDir();
    const config = makeConfig({ vendors: ["exa", "tavily"], cacheTtlMs: 60_000, cacheDir: dir });
    const cache = new SearchCache({ dir, ttlMs: 60_000, now: () => 1_000 });

    const report = await searchWide(
      { query: "partial cache" },
      {
        config,
        cache,
        now: () => 1_000,
        adapters: {
          exa: fakeAdapter("exa", [], {
            throwError: new WideSearchError({ code: "E_NETWORK", message: "down" }),
          }),
          tavily: fakeAdapter("tavily", [result("tavily", 1, "https://tavily.example.com/")]),
        },
      },
    );

    expect(report.cache.stored).toBe(false);
    expect(report.hints.some((hint) => hint.includes("not cached"))).toBe(true);
  });

  it("times out a slow vendor without blocking the others", async () => {
    const config = makeConfig({ vendors: ["exa", "tavily"] });
    const report = await searchWide(
      { query: "timeout", timeoutMs: 10, cache: false },
      {
        config,
        adapters: {
          exa: fakeAdapter("exa", [], { delayMs: 100 }),
          tavily: fakeAdapter("tavily", [result("tavily", 1, "https://fast.example.com/")]),
        },
      },
    );

    expect(report.vendors.find((vendor) => vendor.vendor === "exa")?.status).toBe("timeout");
    expect(report.vendors.find((vendor) => vendor.vendor === "tavily")?.status).toBe("ok");
    expect(report.results).toHaveLength(1);
  });
});
