# @wide-search-toolkit/sdk

Core SDK for wide-search: types, config resolution, vendor adapters, parallel fan-out, canonical-URL dedupe, reciprocal rank fusion, disk cache, and guarded page fetching.

```ts
import { searchWide, fetchPages } from "@wide-search-toolkit/sdk";

const report = await searchWide({
  query: "latest approaches to hybrid retrieval",
  vendors: ["exa", "tavily"],
  mode: "fast",
  limit: 20,
});

console.log(report.results);
console.log(report.vendors); // per-vendor status, latency, estimated cost

const pages = await fetchPages({
  urls: ["https://example.com/article"],
  maxCharsPerPage: 20_000,
});
```

The SDK reads `EXA_API_KEY`, `TAVILY_API_KEY`, `PARALLEL_API_KEY`, `PERPLEXITY_API_KEY`, `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`, `ZAI_API_KEY`, `OLLAMA_API_KEY`, `FIRECRAWL_API_KEY`, and `TINYFISH_API_KEY` from the environment, a `.env` found by walking up from cwd, the OS keychain, or `~/.config/wide-search/config.json`. At least one vendor must be configured for a search.

`loadConfig()` (used by `searchWide()` when no `config` is passed) reads the keychain through `Bun.secrets` under service `wide-search`, only for keys the environment and `.env` did not supply; on Node, or when the keychain is unavailable, it skips that step. `resolveConfig()` is the synchronous variant without the keychain. Pass `secretStore` to `loadConfig()` to inject your own `SecretStore`, or `null` to skip it.

See the repo [README](../../README.md) and [spec](../../docs/specs/wide-search.md).
