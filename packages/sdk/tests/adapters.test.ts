import { afterEach, describe, expect, it } from "bun:test";
import { WideSearchError } from "../src/errors.js";
import type { Freshness, SearchMode, VendorId } from "../src/types.js";
import type { VendorSearchArgs } from "../src/vendors/types.js";
import { exaAdapter } from "../src/vendors/exa.js";
import { tavilyAdapter } from "../src/vendors/tavily.js";
import { parallelAdapter } from "../src/vendors/parallel.js";
import { perplexityAdapter } from "../src/vendors/perplexity.js";
import { dataForSeoAdapter } from "../src/vendors/dataforseo.js";
import { zaiAdapter } from "../src/vendors/zai.js";
import { ollamaAdapter } from "../src/vendors/ollama.js";
import { firecrawlAdapter } from "../src/vendors/firecrawl.js";
import { tinyfishAdapter } from "../src/vendors/tinyfish.js";

const originalFetch = globalThis.fetch;

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function mockFetch(
  payload: unknown,
  options: { status?: number; headers?: Record<string, string>; rawBody?: string } = {},
): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(options.rawBody ?? JSON.stringify(payload), {
      status: options.status ?? 200,
      headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    });
  }) as typeof fetch;
  return calls;
}

function makeArgs(
  vendor: VendorId,
  credentials: Record<string, string>,
  options: { mode?: SearchMode; freshness?: Freshness; maxResults?: number } = {},
): VendorSearchArgs {
  return {
    query: "test query",
    maxResults: options.maxResults ?? 5,
    mode: options.mode ?? "standard",
    ...(options.freshness ? { freshness: options.freshness } : {}),
    credentials,
    signal: new AbortController().signal,
    userAgent: `wide-search-test/${vendor}`,
  };
}

function bodyOf(call: FetchCall | undefined): Record<string, unknown> {
  if (!call?.init?.body || typeof call.init.body !== "string") return {};
  return JSON.parse(call.init.body) as Record<string, unknown>;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("vendor adapters", () => {
  it("maps Exa results and fast mode", async () => {
    const calls = mockFetch({
      results: [
        {
          title: "Exa result",
          url: "https://example.com/page",
          publishedDate: "2024-01-02T00:00:00.000Z",
          highlights: ["A useful snippet"],
        },
      ],
    });

    const response = await exaAdapter.search(
      makeArgs("exa", { EXA_API_KEY: "exa-key" }, { mode: "fast", freshness: "week" }),
    );
    const body = bodyOf(calls[0]);

    expect(calls[0]?.url).toBe("https://api.exa.ai/search");
    expect(body.type).toBe("lite");
    expect(body.numResults).toBe(5);
    expect(body.startPublishedDate).toBeTypeOf("string");
    expect(response.results[0]?.vendor).toBe("exa");
    expect(response.results[0]?.date).toBe("2024-01-02");
    expect(response.costUsd).toBeGreaterThan(0);
  });

  it("maps Tavily results, auth, and freshness", async () => {
    const calls = mockFetch({
      results: [
        {
          title: "Tavily result",
          url: "https://example.com/tavily",
          content: "Tavily snippet",
          published_date: "Tue, 11 Mar 2025 17:00:00 GMT",
        },
      ],
    });

    const response = await tavilyAdapter.search(
      makeArgs("tavily", { TAVILY_API_KEY: "tvly-key" }, { mode: "fast", freshness: "week" }),
    );
    const body = bodyOf(calls[0]);
    const headers = calls[0]?.init?.headers as Record<string, string>;

    expect(headers.authorization).toBe("Bearer tvly-key");
    expect(body.search_depth).toBe("fast");
    expect(body.time_range).toBe("week");
    expect(response.results[0]?.date).toBe("2025-03-11");
  });

  it("maps Parallel results and advanced settings", async () => {
    const calls = mockFetch({
      results: [
        {
          title: "Parallel result",
          url: "https://example.com/parallel",
          publish_date: "2024-01-02",
          excerpts: ["First excerpt", "Second excerpt"],
        },
      ],
    });

    const response = await parallelAdapter.search(
      makeArgs("parallel", { PARALLEL_API_KEY: "parallel-key" }, { mode: "fast", freshness: "month" }),
    );
    const body = bodyOf(calls[0]);
    const advanced = body.advanced_settings as Record<string, unknown>;

    expect(body.mode).toBe("fast");
    expect(advanced.max_results).toBe(5);
    expect((advanced.source_policy as Record<string, unknown>).after_date).toBeTypeOf("string");
    expect(response.results[0]?.snippet).toContain("First excerpt");
  });

  it("maps Perplexity results and fast mode", async () => {
    const calls = mockFetch({
      results: [
        {
          title: "Perplexity result",
          url: "https://example.com/perplexity",
          snippet: "Perplexity snippet",
          date: "2024-01-02",
        },
      ],
    });

    const response = await perplexityAdapter.search(
      makeArgs("perplexity", { PERPLEXITY_API_KEY: "pplx-key" }, { mode: "fast", freshness: "week" }),
    );
    const body = bodyOf(calls[0]);

    expect(body.search_type).toBe("fast");
    expect(body.search_recency_filter).toBe("week");
    expect(response.results[0]?.snippet).toBe("Perplexity snippet");
  });

  it("maps DataForSEO organic items and ignores other item types", async () => {
    const calls = mockFetch({
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          result: [
            {
              items: [
                {
                  type: "organic",
                  title: "DataForSEO result",
                  url: "https://example.com/dataforseo",
                  description: "DataForSEO snippet",
                  rank_absolute: 1,
                  timestamp: "2024-01-02 10:00:00 +00:00",
                },
                {
                  type: "featured_snippet",
                  title: "Not organic",
                  url: "https://example.com/not-organic",
                },
              ],
            },
          ],
        },
      ],
    });

    const response = await dataForSeoAdapter.search(
      makeArgs("dataforseo", {
        DATAFORSEO_LOGIN: "login",
        DATAFORSEO_PASSWORD: "password",
      }),
    );
    const headers = calls[0]?.init?.headers as Record<string, string>;

    expect(headers.authorization).toStartWith("Basic ");
    expect(response.results).toHaveLength(1);
    expect(response.results[0]?.date).toBe("2024-01-02");
  });

  it("maps Z.AI results and recency names", async () => {
    const calls = mockFetch({
      search_result: [
        {
          title: "Z.AI result",
          content: "Z.AI snippet",
          link: "https://example.com/zai",
          publish_date: "2024-01-02",
        },
      ],
    });

    const response = await zaiAdapter.search(
      makeArgs("zai", { ZAI_API_KEY: "zai-key" }, { freshness: "week" }),
    );
    const body = bodyOf(calls[0]);

    expect(body.search_engine).toBe("search-prime");
    expect(body.search_recency_filter).toBe("oneWeek");
    expect(response.results[0]?.vendor).toBe("zai");
  });

  it("caps Ollama results at its documented maximum", async () => {
    const calls = mockFetch({
      results: [
        { title: "Ollama result", url: "https://example.com/ollama", content: "Ollama snippet" },
      ],
    });

    await ollamaAdapter.search(
      makeArgs("ollama", { OLLAMA_API_KEY: "ollama-key" }, { maxResults: 20 }),
    );
    expect(bodyOf(calls[0]).max_results).toBe(10);
  });

  it("maps Firecrawl web results and freshness", async () => {
    const calls = mockFetch({
      success: true,
      data: {
        web: [
          {
            title: "Firecrawl result",
            description: "Firecrawl snippet",
            url: "https://example.com/firecrawl",
            position: 1,
          },
        ],
      },
    });

    const response = await firecrawlAdapter.search(
      makeArgs("firecrawl", { FIRECRAWL_API_KEY: "fc-key" }, { mode: "fast", freshness: "week" }),
    );
    const body = bodyOf(calls[0]);
    const headers = calls[0]?.init?.headers as Record<string, string>;

    expect(calls[0]?.url).toBe("https://api.firecrawl.dev/v2/search");
    expect(headers.authorization).toBe("Bearer fc-key");
    expect(body.sources).toEqual(["web"]);
    expect(body.tbs).toBe("qdr:w");
    expect(response.results[0]?.vendor).toBe("firecrawl");
    expect(response.results[0]?.snippet).toBe("Firecrawl snippet");
  });

  it("maps TinyFish results, auth, and recency", async () => {
    const calls = mockFetch({
      query: "test query",
      results: [
        {
          position: 1,
          site_name: "example.com",
          title: "TinyFish result",
          snippet: "TinyFish snippet",
          url: "https://example.com/tinyfish",
          date: "2024-01-02",
        },
      ],
      total_results: 1,
      page: 0,
    });

    const response = await tinyfishAdapter.search(
      makeArgs("tinyfish", { TINYFISH_API_KEY: "tiny-key" }, { freshness: "week" }),
    );
    const url = new URL(calls[0]?.url ?? "");
    const headers = calls[0]?.init?.headers as Record<string, string>;

    expect(url.origin).toBe("https://api.search.tinyfish.ai");
    expect(url.searchParams.get("query")).toBe("test query");
    expect(url.searchParams.get("recency_minutes")).toBe("10080");
    expect(headers["x-api-key"]).toBe("tiny-key");
    expect(response.results[0]?.vendor).toBe("tinyfish");
    expect(response.results[0]?.date).toBe("2024-01-02");
  });

  it("maps HTTP 401 to an auth error", async () => {
    mockFetch({ error: "nope" }, { status: 401 });
    await expect(
      exaAdapter.search(makeArgs("exa", { EXA_API_KEY: "bad" })),
    ).rejects.toMatchObject({ code: "E_AUTH" });
  });

  it("maps HTTP 429 to a rate-limit error with retry-after", async () => {
    mockFetch({ error: "slow down" }, { status: 429, headers: { "retry-after": "12" } });
    try {
      await exaAdapter.search(makeArgs("exa", { EXA_API_KEY: "key" }));
      throw new Error("expected a rate-limit error");
    } catch (error) {
      expect(error).toBeInstanceOf(WideSearchError);
      expect((error as WideSearchError).code).toBe("E_RATE_LIMIT");
      expect((error as WideSearchError).retryAfterSeconds).toBe(12);
    }
  });

  it("maps a non-JSON successful response to a network error", async () => {
    mockFetch({}, { rawBody: "not json" });
    await expect(
      exaAdapter.search(makeArgs("exa", { EXA_API_KEY: "key" })),
    ).rejects.toMatchObject({ code: "E_NETWORK" });
  });
});
