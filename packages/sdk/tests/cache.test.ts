import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SearchCache, cacheKeyFor } from "../src/cache.js";
import { makeReport } from "./helpers.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "wide-search-cache-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("SearchCache", () => {
  it("writes and reads a report with an age", () => {
    let now = 1_000;
    const cache = new SearchCache({ dir: tempDir(), ttlMs: 10_000, now: () => now });
    const key = cacheKeyFor({ query: "hello" });
    cache.write(key, makeReport());

    now = 4_500;
    const hit = cache.read(key);
    expect(hit?.ageMs).toBe(3_500);
    expect(hit?.report.query).toBe("test query");
  });

  it("returns null for an expired entry and removes it", () => {
    let now = 1_000;
    const dir = tempDir();
    const cache = new SearchCache({ dir, ttlMs: 1_000, now: () => now });
    const key = cacheKeyFor({ query: "hello" });
    cache.write(key, makeReport());

    now = 5_000;
    expect(cache.read(key)).toBeNull();
    expect(readdirSync(join(dir, "search"))).toHaveLength(0);
  });

  it("tolerates a corrupt cache file", () => {
    const dir = tempDir();
    const cache = new SearchCache({ dir, ttlMs: 10_000, now: () => 1_000 });
    const key = cacheKeyFor({ query: "corrupt" });
    cache.write(key, makeReport());
    writeFileSync(join(dir, "search", `${key}.json`), "{not json");

    expect(cache.read(key)).toBeNull();
  });

  it("disables reads and writes when the TTL is zero", () => {
    const cache = new SearchCache({ dir: tempDir(), ttlMs: 0, now: () => 1_000 });
    const key = cacheKeyFor({ query: "disabled" });
    cache.write(key, makeReport());
    expect(cache.read(key)).toBeNull();
    expect(cache.stats().entries).toBe(0);
  });

  it("clears entries and reports stats", () => {
    const cache = new SearchCache({ dir: tempDir(), ttlMs: 10_000, now: () => 1_000 });
    cache.write(cacheKeyFor({ query: "one" }), makeReport());
    cache.write(cacheKeyFor({ query: "two" }), makeReport());
    expect(cache.stats().entries).toBe(2);
    expect(cache.clear()).toBe(2);
    expect(cache.stats().entries).toBe(0);
  });
});
