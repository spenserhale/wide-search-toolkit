import { z } from "zod";

// ---------------------------------------------------------------------------
// Vendor and request vocabulary
// ---------------------------------------------------------------------------

export const VENDOR_IDS = [
  "exa",
  "tavily",
  "parallel",
  "perplexity",
  "dataforseo",
  "zai",
  "ollama",
  "firecrawl",
  "tinyfish",
] as const;

export const VendorIdSchema = z.enum(VENDOR_IDS);
export type VendorId = (typeof VENDOR_IDS)[number];

export const SEARCH_MODES = ["fast", "standard"] as const;
export const SearchModeSchema = z.enum(SEARCH_MODES);
export type SearchMode = (typeof SEARCH_MODES)[number];

export const FRESHNESS_VALUES = ["day", "week", "month", "year"] as const;
export const FreshnessSchema = z.enum(FRESHNESS_VALUES);
export type Freshness = (typeof FRESHNESS_VALUES)[number];

export const OUTPUT_FORMATS = ["toon", "json", "csv", "text"] as const;
export const OutputFormatSchema = z.enum(OUTPUT_FORMATS);
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

// ---------------------------------------------------------------------------
// Normalized and merged results
// ---------------------------------------------------------------------------

export const NormalizedResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  date: z.string().optional(),
  vendor: VendorIdSchema,
  rank: z.number().int().positive(),
});
export type NormalizedResult = z.infer<typeof NormalizedResultSchema>;

export const MergedResultSchema = z.object({
  rank: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  date: z.string().optional(),
  vendors: z.array(VendorIdSchema),
  found_by: z.number().int().positive(),
  best_rank: z.number().int().positive(),
  score: z.number().nonnegative(),
});
export type MergedResult = z.infer<typeof MergedResultSchema>;

export const VENDOR_REPORT_STATUSES = [
  "ok",
  "timeout",
  "error",
  "skipped_unconfigured",
  "skipped_budget",
] as const;
export const VendorReportStatusSchema = z.enum(VENDOR_REPORT_STATUSES);
export type VendorReportStatus = (typeof VENDOR_REPORT_STATUSES)[number];

export const VendorReportSchema = z.object({
  vendor: VendorIdSchema,
  label: z.string(),
  selected: z.boolean(),
  status: VendorReportStatusSchema,
  results: z.number().int().nonnegative(),
  latency_ms: z.number().nonnegative().nullable(),
  estimated_cost_usd: z.number().nonnegative(),
  error: z.string().optional(),
  error_code: z.string().optional(),
  reason: z.string().optional(),
  cached: z.boolean().optional(),
});
export type VendorReport = z.infer<typeof VendorReportSchema>;

export const SearchStatsSchema = z.object({
  vendors_configured: z.number().int().nonnegative(),
  vendors_selected: z.number().int().nonnegative(),
  vendors_ok: z.number().int().nonnegative(),
  vendors_failed: z.number().int().nonnegative(),
  results_before_dedupe: z.number().int().nonnegative(),
  results_after_dedupe: z.number().int().nonnegative(),
  invalid_urls: z.number().int().nonnegative(),
  estimated_cost_usd: z.number().nonnegative(),
  cached_estimated_cost_usd: z.number().nonnegative(),
  budget_usd: z.number().nonnegative(),
  duration_ms: z.number().nonnegative(),
});
export type SearchStats = z.infer<typeof SearchStatsSchema>;

export const CacheInfoSchema = z.object({
  enabled: z.boolean(),
  hit: z.boolean(),
  stored: z.boolean(),
  age_ms: z.number().nonnegative().nullable(),
  key: z.string(),
});
export type CacheInfo = z.infer<typeof CacheInfoSchema>;

export const SearchReportSchema = z.object({
  schema_version: z.literal("1"),
  query: z.string(),
  mode: SearchModeSchema,
  freshness: FreshnessSchema.optional(),
  generated_at: z.string(),
  cache: CacheInfoSchema,
  limit: z.number().int().positive(),
  truncated: z.boolean(),
  total_merged: z.number().int().nonnegative(),
  results: z.array(MergedResultSchema),
  vendors: z.array(VendorReportSchema),
  stats: SearchStatsSchema,
  all_failed: z.boolean(),
  hints: z.array(z.string()),
});
export type SearchReport = z.infer<typeof SearchReportSchema>;

// ---------------------------------------------------------------------------
// Page fetching
// ---------------------------------------------------------------------------

export const FetchPageSchema = z.object({
  url: z.string(),
  final_url: z.string().optional(),
  status: z.number().int().optional(),
  title: z.string().optional(),
  text: z.string(),
  content_type: z.string().optional(),
  bytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
  total_cap_reached: z.boolean().optional(),
  latency_ms: z.number().nonnegative().nullable(),
  error: z.string().optional(),
  error_code: z.string().optional(),
});
export type FetchPage = z.infer<typeof FetchPageSchema>;

export const FetchStatsSchema = z.object({
  requested: z.number().int().nonnegative(),
  ok: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  total_chars: z.number().int().nonnegative(),
  truncated: z.number().int().nonnegative(),
  duration_ms: z.number().nonnegative(),
});
export type FetchStats = z.infer<typeof FetchStatsSchema>;

export const FetchReportSchema = z.object({
  schema_version: z.literal("1"),
  generated_at: z.string(),
  pages: z.array(FetchPageSchema),
  stats: FetchStatsSchema,
  hints: z.array(z.string()),
});
export type FetchReport = z.infer<typeof FetchReportSchema>;

// ---------------------------------------------------------------------------
// Vendor catalog
// ---------------------------------------------------------------------------

export interface VendorCatalogEntry {
  readonly id: VendorId;
  readonly label: string;
  readonly envKeys: readonly string[];
  readonly maxResults: number;
  readonly supportsFreshness: boolean;
  readonly costUsd: { readonly fast: number; readonly standard: number };
  readonly docsUrl: string;
  readonly notes: string;
}

export interface VendorStatus extends VendorCatalogEntry {
  readonly configured: boolean;
  readonly selected_by_default: boolean;
}
