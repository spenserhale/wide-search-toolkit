export {
  VENDOR_IDS,
  SEARCH_MODES,
  FRESHNESS_VALUES,
  OUTPUT_FORMATS,
  VendorIdSchema,
  SearchModeSchema,
  FreshnessSchema,
  OutputFormatSchema,
  NormalizedResultSchema,
  MergedResultSchema,
  VendorReportStatusSchema,
  VendorReportSchema,
  SearchStatsSchema,
  CacheInfoSchema,
  SearchReportSchema,
  FetchPageSchema,
  FetchStatsSchema,
  FetchReportSchema,
} from "./types.js";
export type {
  VendorId,
  SearchMode,
  Freshness,
  OutputFormat,
  NormalizedResult,
  MergedResult,
  VendorReportStatus,
  VendorReport,
  SearchStats,
  CacheInfo,
  SearchReport,
  FetchPage,
  FetchStats,
  FetchReport,
  VendorCatalogEntry,
  VendorStatus,
} from "./types.js";

export {
  ERROR_CODES,
  WideSearchError,
  isWideSearchError,
  asWideSearchError,
} from "./errors.js";
export type { ErrorCode } from "./errors.js";

export {
  resolveConfig,
  redactedConfig,
  configuredVendorIds,
  isVendorConfigured,
  vendorEnvKeys,
} from "./config.js";
export type {
  ResolvedConfig,
  RedactedConfig,
  VendorCredentials,
  CredentialsByVendor,
  Env,
} from "./config.js";

export { canonicalizeUrl, displayHost } from "./canonical.js";
export { normalizeDate, truncateText, nonEmptyString, unique } from "./normalize.js";
export { mergeResults, RRF_K } from "./rank.js";
export { SearchCache, cacheKeyFor, clearCacheDirectory } from "./cache.js";
export type { CacheHit, CacheStats, SearchCacheOptions } from "./cache.js";
export { searchWide } from "./engine.js";
export type { SearchOptions, SearchDeps } from "./engine.js";
export { fetchPages, decodeEntities, htmlToText, extractTitle, isPrivateAddress, isBlockedHostname } from "./fetch.js";
export type { FetchPagesOptions } from "./fetch.js";
export {
  DEFAULT_ADAPTERS,
  exaAdapter,
  tavilyAdapter,
  parallelAdapter,
  perplexityAdapter,
  dataForSeoAdapter,
  zaiAdapter,
  ollamaAdapter,
  firecrawlAdapter,
  tinyfishAdapter,
  VENDOR_CATALOG,
  vendorCostUsd,
  listVendorStatus,
  listVendorStatusFromConfig,
} from "./vendors/index.js";
export type { VendorAdapter, VendorSearchArgs, VendorSearchResponse } from "./vendors/index.js";
