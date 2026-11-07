import { describe, expect, it } from "bun:test";
import { canonicalizeUrl } from "../src/canonical.js";

describe("canonicalizeUrl", () => {
  it("strips www, tracking parameters, fragments, and trailing slashes", () => {
    expect(
      canonicalizeUrl(
        "https://www.Example.com/path/?utm_source=newsletter&b=2&a=1#section",
      ),
    ).toBe("https://example.com/path?a=1&b=2");
  });

  it("sorts query parameters for a stable key", () => {
    expect(canonicalizeUrl("https://example.com/?b=2&a=1")).toBe(
      "https://example.com/?a=1&b=2",
    );
  });

  it("keeps meaningful query parameters", () => {
    expect(canonicalizeUrl("https://example.com/search?q=hello+world")).toBe(
      "https://example.com/search?q=hello+world",
    );
  });

  it("normalizes default ports", () => {
    expect(canonicalizeUrl("https://example.com:443/a")).toBe("https://example.com/a");
    expect(canonicalizeUrl("http://example.com:80/a")).toBe("http://example.com/a");
  });

  it("rejects non-HTTP URLs and invalid input", () => {
    expect(canonicalizeUrl("mailto:hello@example.com")).toBeNull();
    expect(canonicalizeUrl("not a url")).toBeNull();
  });
});
