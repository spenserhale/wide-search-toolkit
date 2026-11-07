import { describe, expect, it } from "bun:test";
import { mergeResults } from "../src/rank.js";
import { result } from "./helpers.js";

describe("mergeResults", () => {
  it("dedupes by canonical URL and keeps every vendor that found it", () => {
    const merged = mergeResults(
      [
        result("exa", 1, "https://www.example.com/page/?utm_source=exa"),
        result("tavily", 2, "https://example.com/page"),
        result("exa", 2, "https://other.example.com/"),
      ],
      { limit: 50, snippetChars: 500 },
    );

    expect(merged.resultsAfterDedupe).toBe(2);
    expect(merged.results[0]?.url).toBe("https://example.com/page");
    expect(merged.results[0]?.vendors).toEqual(["exa", "tavily"]);
    expect(merged.results[0]?.found_by).toBe(2);
  });

  it("counts a vendor once even when it returns the same page twice", () => {
    const merged = mergeResults(
      [
        result("exa", 1, "https://example.com/page?utm_source=one"),
        result("exa", 5, "https://example.com/page?utm_source=two"),
      ],
      { limit: 50, snippetChars: 500 },
    );

    expect(merged.results).toHaveLength(1);
    expect(merged.results[0]?.found_by).toBe(1);
    expect(merged.results[0]?.vendors).toEqual(["exa"]);
  });

  it("ranks consensus above a single vendor hit", () => {
    const merged = mergeResults(
      [
        result("exa", 1, "https://solo.example.com/"),
        result("tavily", 1, "https://consensus.example.com/"),
        result("parallel", 2, "https://consensus.example.com/"),
      ],
      { limit: 50, snippetChars: 500 },
    );

    expect(merged.results[0]?.url).toBe("https://consensus.example.com/");
    expect(merged.results[0]?.found_by).toBe(2);
  });

  it("applies the limit and reports truncation", () => {
    const merged = mergeResults(
      [
        result("exa", 1, "https://one.example.com/"),
        result("exa", 2, "https://two.example.com/"),
        result("exa", 3, "https://three.example.com/"),
      ],
      { limit: 2, snippetChars: 500 },
    );

    expect(merged.results).toHaveLength(2);
    expect(merged.resultsAfterDedupe).toBe(3);
    expect(merged.truncated).toBe(true);
  });

  it("ignores invalid result URLs", () => {
    const merged = mergeResults(
      [result("exa", 1, "not-a-url"), result("exa", 2, "https://valid.example.com/")],
      { limit: 50, snippetChars: 500 },
    );

    expect(merged.invalidUrls).toBe(1);
    expect(merged.results).toHaveLength(1);
  });
});
