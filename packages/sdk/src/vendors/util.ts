import type { NormalizedResult, VendorId } from "../types.js";
import { normalizeDate, truncateText } from "../normalize.js";

export interface RawVendorItem {
  title?: string | null;
  url?: string | null;
  snippet?: string | null;
  date?: string | null;
}

export function toNormalizedResults(
  vendor: VendorId,
  items: readonly RawVendorItem[],
  maxResults: number,
  snippetChars = 2_000,
): NormalizedResult[] {
  const out: NormalizedResult[] = [];
  for (const item of items) {
    if (!item.url) continue;
    const url = item.url.trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const date = normalizeDate(item.date);
    out.push({
      title: (item.title?.trim() || url).slice(0, 500),
      url,
      snippet: truncateText(item.snippet ?? "", snippetChars),
      ...(date ? { date } : {}),
      vendor,
      rank: out.length + 1,
    });
    if (out.length >= maxResults) break;
  }
  return out;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function getNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
