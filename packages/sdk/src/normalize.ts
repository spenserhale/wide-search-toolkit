const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Keep dates comparable without inventing precision. Vendor date formats vary
 * (ISO, RFC 1123, DataForSEO timestamps); when a value parses, store the ISO
 * date; otherwise keep the vendor's original string.
 */
export function normalizeDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (DATE_ONLY.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toISOString().slice(0, 10);
}

export function truncateText(value: string, maxChars: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}
