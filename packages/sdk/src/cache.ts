import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { WideSearchError } from "./errors.js";
import { SearchReportSchema, type SearchReport } from "./types.js";

export interface SearchCacheOptions {
  dir: string;
  ttlMs: number;
  now?: () => number;
  maxEntries?: number;
}

interface CacheEntry {
  key: string;
  created_at: number;
  report: SearchReport;
}

export interface CacheHit {
  report: SearchReport;
  ageMs: number;
}

export interface CacheStats {
  dir: string;
  entries: number;
  bytes: number;
  ttl_ms: number;
  oldest_age_ms: number | null;
}

const CACHE_SUBDIR = "search";
const DEFAULT_MAX_ENTRIES = 500;

export function cacheKeyFor(parts: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/**
 * Disk-backed search cache. Only complete successful aggregates are written by
 * the engine; this class does not decide what is cacheable. Reads tolerate a
 * corrupt or expired file by deleting it and returning null.
 */
export class SearchCache {
  private readonly dir: string;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(options: SearchCacheOptions) {
    this.dir = options.dir;
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  get directory(): string {
    return join(this.dir, CACHE_SUBDIR);
  }

  read(key: string): CacheHit | null {
    if (this.ttlMs <= 0) return null;
    const path = this.pathFor(key);
    if (!existsSync(path)) return null;

    let entry: CacheEntry;
    try {
      entry = JSON.parse(readFileSync(path, "utf8")) as CacheEntry;
    } catch {
      this.removeQuietly(path);
      return null;
    }

    if (
      !entry ||
      entry.key !== key ||
      typeof entry.created_at !== "number" ||
      !entry.report
    ) {
      this.removeQuietly(path);
      return null;
    }

    const parsed = SearchReportSchema.safeParse(entry.report);
    if (!parsed.success) {
      this.removeQuietly(path);
      return null;
    }

    const ageMs = this.now() - entry.created_at;
    if (ageMs < 0 || ageMs > this.ttlMs) {
      this.removeQuietly(path);
      return null;
    }

    return { report: parsed.data, ageMs };
  }

  write(key: string, report: SearchReport): void {
    if (this.ttlMs <= 0) return;
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      const entry: CacheEntry = { key, created_at: this.now(), report };
      const path = this.pathFor(key);
      const temp = `${path}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
      writeFileSync(temp, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
      renameSync(temp, path);
      this.prune();
    } catch (error) {
      throw new WideSearchError({
        code: "E_CACHE",
        message: `Could not write the search cache at ${this.directory}`,
        hint: "Set WIDE_SEARCH_CACHE_DIR to a writable directory, or pass --no-cache.",
        cause: error,
      });
    }
  }

  clear(): number {
    if (!existsSync(this.directory)) return 0;
    let removed = 0;
    for (const name of readdirSync(this.directory)) {
      if (!name.endsWith(".json")) continue;
      this.removeQuietly(join(this.directory, name));
      removed += 1;
    }
    return removed;
  }

  stats(): CacheStats {
    const entries = this.listEntries();
    let bytes = 0;
    let oldest: number | null = null;
    for (const entry of entries) {
      bytes += entry.bytes;
      if (oldest === null || entry.mtimeMs < oldest) oldest = entry.mtimeMs;
    }
    return {
      dir: this.directory,
      entries: entries.length,
      bytes,
      ttl_ms: this.ttlMs,
      oldest_age_ms: oldest === null ? null : Math.max(0, this.now() - oldest),
    };
  }

  private pathFor(key: string): string {
    return join(this.directory, `${key}.json`);
  }

  private removeQuietly(path: string): void {
    try {
      unlinkSync(path);
    } catch {
      // A cache entry that cannot be deleted is harmless; the next read will
      // either parse it or fall through to a fresh search.
    }
  }

  private listEntries(): Array<{ path: string; mtimeMs: number; bytes: number }> {
    if (!existsSync(this.directory)) return [];
    const entries: Array<{ path: string; mtimeMs: number; bytes: number }> = [];
    for (const name of readdirSync(this.directory)) {
      if (!name.endsWith(".json")) continue;
      const path = join(this.directory, name);
      try {
        const stat = statSync(path);
        entries.push({ path, mtimeMs: stat.mtimeMs, bytes: stat.size });
      } catch {
        // Raced with another process; ignore.
      }
    }
    return entries;
  }

  private prune(): void {
    const entries = this.listEntries();
    const cutoff = this.now() - this.ttlMs;
    const expired = entries.filter((entry) => entry.mtimeMs < cutoff);
    for (const entry of expired) {
      this.removeQuietly(entry.path);
    }

    const remaining = entries
      .filter((entry) => entry.mtimeMs >= cutoff)
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    const excess = remaining.length - this.maxEntries;
    for (let index = 0; index < excess; index += 1) {
      const entry = remaining[index];
      if (entry) this.removeQuietly(entry.path);
    }
  }
}

/** Test and maintenance helper: delete the whole cache directory. */
export function clearCacheDirectory(dir: string): void {
  rmSync(join(dir, CACHE_SUBDIR), { recursive: true, force: true });
}
