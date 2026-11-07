import type { SearchMode, VendorCatalogEntry, VendorId, VendorStatus } from "../types.js";
import {
  configuredVendorIds,
  type CredentialsByVendor,
  type ResolvedConfig,
} from "../config.js";

export const VENDOR_CATALOG: Record<VendorId, VendorCatalogEntry> = {
  exa: {
    id: "exa",
    label: "Exa",
    envKeys: ["EXA_API_KEY"],
    maxResults: 100,
    supportsFreshness: true,
    costUsd: { fast: 0.005, standard: 0.005 },
    docsUrl: "https://docs.exa.ai/reference/search",
    notes: "Neural search; fast mode uses Exa's lite search type.",
  },
  tavily: {
    id: "tavily",
    label: "Tavily",
    envKeys: ["TAVILY_API_KEY"],
    maxResults: 20,
    supportsFreshness: true,
    costUsd: { fast: 0.008, standard: 0.008 },
    docsUrl: "https://docs.tavily.com/documentation/api-reference/endpoint/search",
    notes: "Agent-oriented search with a free tier.",
  },
  parallel: {
    id: "parallel",
    label: "Parallel",
    envKeys: ["PARALLEL_API_KEY"],
    maxResults: 20,
    supportsFreshness: true,
    costUsd: { fast: 0.001, standard: 0.005 },
    docsUrl: "https://docs.parallel.ai/api-reference/search/search",
    notes: "Fast mode is the cheapest option in the default set.",
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    envKeys: ["PERPLEXITY_API_KEY"],
    maxResults: 20,
    supportsFreshness: true,
    costUsd: { fast: 0.005, standard: 0.005 },
    docsUrl: "https://docs.perplexity.ai/api-reference/search-post",
    notes: "Structured Search API; fast mode is lower latency.",
  },
  dataforseo: {
    id: "dataforseo",
    label: "DataForSEO",
    envKeys: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
    maxResults: 100,
    supportsFreshness: false,
    costUsd: { fast: 0.002, standard: 0.002 },
    docsUrl: "https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/",
    notes: "Live Google SERP; credentials are a login/password pair.",
  },
  zai: {
    id: "zai",
    label: "Z.AI",
    envKeys: ["ZAI_API_KEY", "Z_AI_API_KEY"],
    maxResults: 50,
    supportsFreshness: true,
    costUsd: { fast: 0.01, standard: 0.01 },
    docsUrl: "https://docs.z.ai/api-reference/tools/web-search",
    notes: "search-prime engine; the most expensive default vendor.",
  },
  ollama: {
    id: "ollama",
    label: "Ollama Cloud",
    envKeys: ["OLLAMA_API_KEY"],
    maxResults: 10,
    supportsFreshness: false,
    costUsd: { fast: 0.01, standard: 0.01 },
    docsUrl: "https://docs.ollama.com/capabilities/web-search",
    notes: "Hosted web search; maximum 10 results per request.",
  },
  firecrawl: {
    id: "firecrawl",
    label: "Firecrawl",
    envKeys: ["FIRECRAWL_API_KEY"],
    maxResults: 100,
    supportsFreshness: true,
    costUsd: { fast: 0.002, standard: 0.002 },
    docsUrl: "https://docs.firecrawl.dev/features/search",
    notes: "Search API; this adapter requests web snippets only, not scraped page content.",
  },
  tinyfish: {
    id: "tinyfish",
    label: "TinyFish",
    envKeys: ["TINYFISH_API_KEY"],
    maxResults: 10,
    supportsFreshness: true,
    costUsd: { fast: 0.001, standard: 0.001 },
    docsUrl: "https://docs.tinyfish.ai/search-api",
    notes: "Search is free up to 12,000 requests/day; the estimate covers paid overflow.",
  },
};

export function vendorCostUsd(id: VendorId, mode: SearchMode): number {
  return VENDOR_CATALOG[id].costUsd[mode];
}

export function listVendorStatus(
  credentials: CredentialsByVendor,
  defaultVendors: readonly VendorId[],
): VendorStatus[] {
  const configured = new Set(configuredVendorIds(credentials));
  const defaults = new Set(defaultVendors);
  return Object.values(VENDOR_CATALOG).map((entry) => ({
    ...entry,
    configured: configured.has(entry.id),
    selected_by_default: defaults.has(entry.id),
  }));
}

export function listVendorStatusFromConfig(config: ResolvedConfig): VendorStatus[] {
  return listVendorStatus(config.credentials, config.vendors);
}
