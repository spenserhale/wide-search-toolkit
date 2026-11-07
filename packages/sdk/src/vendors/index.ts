import type { VendorId } from "../types.js";
import type { VendorAdapter } from "./types.js";
import { exaAdapter } from "./exa.js";
import { tavilyAdapter } from "./tavily.js";
import { parallelAdapter } from "./parallel.js";
import { perplexityAdapter } from "./perplexity.js";
import { dataForSeoAdapter } from "./dataforseo.js";
import { zaiAdapter } from "./zai.js";
import { ollamaAdapter } from "./ollama.js";
import { firecrawlAdapter } from "./firecrawl.js";
import { tinyfishAdapter } from "./tinyfish.js";

export const DEFAULT_ADAPTERS: Record<VendorId, VendorAdapter> = {
  exa: exaAdapter,
  tavily: tavilyAdapter,
  parallel: parallelAdapter,
  perplexity: perplexityAdapter,
  dataforseo: dataForSeoAdapter,
  zai: zaiAdapter,
  ollama: ollamaAdapter,
  firecrawl: firecrawlAdapter,
  tinyfish: tinyfishAdapter,
};

export { exaAdapter, tavilyAdapter, parallelAdapter, perplexityAdapter, dataForSeoAdapter, zaiAdapter, ollamaAdapter, firecrawlAdapter, tinyfishAdapter };
export { VENDOR_CATALOG, vendorCostUsd, listVendorStatus, listVendorStatusFromConfig } from "./catalog.js";
export type { VendorAdapter, VendorSearchArgs, VendorSearchResponse } from "./types.js";
