import {
  ERROR_CODES,
  OUTPUT_FORMATS,
  VENDOR_CATALOG,
  type VendorCatalogEntry,
} from "@wide-search-toolkit/sdk";
import { describeTree, type CommandTree } from "./lib/introspect.js";
import { CLI_NAME, CLI_VERSION } from "./version.js";

export const SCHEMA_VERSION = "1";
export const REPO = "spenserhale/wide-search-toolkit";

export interface AgentContext {
  schema_version: string;
  cli: { name: string; version: string; repo: string };
  purpose: string;
  workflow: string[];
  output: {
    formats: readonly string[];
    default: string;
    env: string;
    flags: Record<string, string>;
    csv_scope: string;
  };
  ranking: {
    fusion: string;
    rrf_k: number;
    dedupe: string;
    tie_break: string;
    freshness: string;
  };
  budget: {
    default_usd: number;
    selection: string;
    note: string;
  };
  cache: {
    default_ttl_ms: number;
    stores: string;
    bypass: string;
  };
  fetch: {
    max_urls: number;
    max_chars_per_page: number;
    max_total_chars: number;
    timeout_ms: number;
    private_hosts: string;
  };
  vendors: readonly VendorCatalogEntry[];
  environment: Record<string, string>;
  exit_codes: Record<string, number>;
  error_codes: readonly string[];
  quirks: string[];
  commands: CommandTree;
}

const ENVIRONMENT: Record<string, string> = {
  EXA_API_KEY: "Exa API key",
  TAVILY_API_KEY: "Tavily API key",
  PARALLEL_API_KEY: "Parallel API key",
  PERPLEXITY_API_KEY: "Perplexity API key",
  DATAFORSEO_LOGIN: "DataForSEO login (paired with DATAFORSEO_PASSWORD)",
  DATAFORSEO_PASSWORD: "DataForSEO password",
  ZAI_API_KEY: "Z.AI API key (Z_AI_API_KEY also accepted)",
  OLLAMA_API_KEY: "Ollama Cloud API key",
  FIRECRAWL_API_KEY: "Firecrawl API key",
  TINYFISH_API_KEY: "TinyFish API key",
  WIDE_SEARCH_VENDORS: "Comma-separated default vendor list (default: all vendors)",
  WIDE_SEARCH_TIMEOUT_MS: "Per-vendor timeout in milliseconds (default 8000)",
  WIDE_SEARCH_MAX_PER_VENDOR: "Default max results per vendor (default 10)",
  WIDE_SEARCH_MAX_COST_USD: "Per-call estimated-cost budget in USD (default 0.05)",
  WIDE_SEARCH_CACHE_TTL_MS: "Search cache TTL in milliseconds (default 900000; 0 disables)",
  WIDE_SEARCH_CACHE_DIR: "Cache directory (default: ~/.cache/wide-search)",
  WIDE_SEARCH_OUTPUT: "Default output format: toon | json | csv | text",
  WIDE_SEARCH_FETCH_MAX_CHARS: "Per-page fetch character cap (default 20000)",
  WIDE_SEARCH_FETCH_TOTAL_MAX_CHARS: "Aggregate fetch character cap (default 100000)",
  WIDE_SEARCH_FETCH_CONCURRENCY: "Parallel fetches (default 4)",
  WIDE_SEARCH_FETCH_TIMEOUT_MS: "Per-URL fetch timeout in milliseconds (default 15000)",
  WIDE_SEARCH_SNIPPET_CHARS: "Merged snippet character cap (default 500)",
  WIDE_SEARCH_ALLOW_PRIVATE_HOSTS: "Set 1 to allow private-network fetch targets (explicit opt-in)",
  WIDE_SEARCH_USER_AGENT: "User-Agent sent to vendors and fetched pages",
  WIDE_SEARCH_CONFIG_FILE: "Path to a JSON config file (default: ~/.config/wide-search/config.json)",
};

export function buildAgentContext(root: unknown): AgentContext {
  return {
    schema_version: SCHEMA_VERSION,
    cli: { name: CLI_NAME, version: CLI_VERSION, repo: REPO },
    purpose:
      "Fan one query out to multiple independent web-search vendors, normalize and dedupe by canonical URL, rank with reciprocal rank fusion, and report each vendor's status, latency, and estimated cost.",
    workflow: [
      "wide-search search \"latest approaches to hybrid retrieval\" --json",
      "wide-search search \"topic\" --vendor exa --vendor tavily --toon",
      "wide-search fetch https://example.com/article --json",
      "wide-search vendors",
      "wide-search agent-context --json",
    ],
    output: {
      formats: OUTPUT_FORMATS,
      default: "toon",
      env: "WIDE_SEARCH_OUTPUT sets the default; flags win",
      flags: {
        "--format <toon|json|csv>": "Explicit output format",
        "--toon": "TOON for coding agents (default; fewest tokens)",
        "--json": "Pretty JSON with the full report envelope",
        "--csv": "Flat merged result rows only",
        "--deliver <stdout|file:<path>>": "Write output to stdout or an atomic file write",
      },
      csv_scope:
        "CSV is flat result rows for search, flat page rows for fetch, and flat vendor rows for vendors. JSON/TOON carry the full envelope.",
    },
    ranking: {
      fusion: "Reciprocal rank fusion across vendors",
      rrf_k: 60,
      dedupe:
        "Canonical URL: lower-case host, strip www, tracking parameters, fragments, and trailing slashes; sort query parameters.",
      tie_break: "Score, then found_by, then best_rank, then canonical URL",
      freshness:
        "Freshness is a vendor request filter where supported; it is not an implicit date decay in ranking.",
    },
    budget: {
      default_usd: 0.05,
      selection:
        "All configured vendors by default, cheapest estimated cost first; a vendor is selected only when its whole estimated call fits the remaining budget.",
      note: "Budget is an estimate cap, not a billing guarantee. Costs are estimates, not vendor invoices.",
    },
    cache: {
      default_ttl_ms: 900_000,
      stores: "Complete successful aggregates only; partial results are never cached",
      bypass: "Use --no-cache to bypass both cache reads and cache writes",
    },
    fetch: {
      max_urls: 20,
      max_chars_per_page: 20_000,
      max_total_chars: 100_000,
      timeout_ms: 15_000,
      private_hosts:
        "Loopback, private, link-local, multicast, reserved, metadata, and IPv4-mapped IPv6 targets are blocked unless WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1.",
    },
    vendors: Object.values(VENDOR_CATALOG),
    environment: ENVIRONMENT,
    exit_codes: { ...ERROR_CODES },
    error_codes: Object.keys(ERROR_CODES),
    quirks: [
      "Partial vendor failure exits 0. Read vendors[] statuses instead of treating an empty results array as proof that nothing exists.",
      "When every selected vendor fails, the CLI exits with the first vendor's enumerated error code.",
      "Costs are estimates, not vendor invoices; the vendor may bill differently.",
      "DataForSEO and Ollama do not support freshness filtering; the report explains the gap.",
      "The cache stores only complete successful aggregates; a timeout does not poison the next 15 minutes.",
      "fetch refuses private-network targets by default; this is an explicit config opt-in, not a per-call MCP argument.",
      "Default selection is all configured vendors, cheapest first, until the per-call budget is exhausted.",
      "The merged result keeps each vendor's best rank for a URL; a vendor cannot stuff the ranking with duplicate URLs.",
      "The CLI finds .env by walking up from its cwd and inherits your shell exports; an MCP host may launch the server from a different cwd and does not necessarily inherit your shell environment, so put keys in the host env block, ~/.config/wide-search/config.json, or an op run wrapper.",
      "MCP host env values and user-config keys are plaintext at rest; use an op run wrapper or op inject when keys must not be stored in plaintext.",
    ],
    commands: describeTree(root),
  };
}
