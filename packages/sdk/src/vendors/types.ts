import type {
  Freshness,
  NormalizedResult,
  SearchMode,
  VendorCatalogEntry,
  VendorId,
} from "../types.js";
import type { VendorCredentials } from "../config.js";

export interface VendorSearchArgs {
  query: string;
  maxResults: number;
  mode: SearchMode;
  freshness?: Freshness;
  credentials: VendorCredentials;
  signal: AbortSignal;
  userAgent: string;
}

export interface VendorSearchResponse {
  results: NormalizedResult[];
  costUsd: number;
  warnings?: string[];
}

export interface VendorAdapter {
  readonly id: VendorId;
  readonly label: string;
  readonly maxResults: number;
  readonly supportsFreshness: boolean;
  readonly catalog: VendorCatalogEntry;
  estimateCostUsd(mode: SearchMode): number;
  search(args: VendorSearchArgs): Promise<VendorSearchResponse>;
}
