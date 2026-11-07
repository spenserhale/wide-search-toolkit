import { describe, expect, it } from "bun:test";
import { formatError } from "../src/lib/errors.js";
import { renderOutput, resolveFormat, type Renderers } from "../src/lib/output.js";
import { renderSearchCsv } from "../src/lib/render.js";
import { makeReport } from "../../sdk/tests/helpers.js";
import { WideSearchError } from "@wide-search-toolkit/sdk";

describe("resolveFormat", () => {
  it("defaults to toon", () => {
    expect(resolveFormat({ toon: false, json: false, csv: false, text: false }, {})).toBe("toon");
  });

  it("honors an explicit format", () => {
    expect(
      resolveFormat({ format: "json", toon: false, json: false, csv: false, text: false }, {}),
    ).toBe("json");
  });

  it("rejects two format flags", () => {
    expect(() =>
      resolveFormat({ toon: true, json: true, csv: false, text: false }, {}),
    ).toThrow(WideSearchError);
  });

  it("reads WIDE_SEARCH_OUTPUT", () => {
    expect(
      resolveFormat(
        { toon: false, json: false, csv: false, text: false },
        { WIDE_SEARCH_OUTPUT: "csv" },
      ),
    ).toBe("csv");
  });
});

describe("renderOutput", () => {
  const data = { hello: "world" };
  const renderers: Renderers = { text: () => "human" };

  it("renders JSON", () => {
    expect(renderOutput(data, "json", renderers)).toContain('"hello": "world"');
  });

  it("renders TOON", () => {
    expect(renderOutput(data, "toon", renderers)).toContain("hello: world");
  });

  it("renders text", () => {
    expect(renderOutput(data, "text", renderers)).toBe("human");
  });

  it("refuses CSV without a flat renderer", () => {
    expect(() => renderOutput(data, "csv", renderers)).toThrow(WideSearchError);
  });
});

describe("renderSearchCsv", () => {
  it("emits flat merged rows", () => {
    const csv = renderSearchCsv(makeReport());
    const lines = csv.split("\n");
    expect(lines[0]).toBe("rank,title,url,snippet,date,vendors,found_by,score");
    expect(lines[1]).toContain("Example");
    expect(lines[1]).toContain("https://example.com/");
  });
});

describe("formatError", () => {
  it("includes code, hint, and exit code", () => {
    const formatted = formatError(
      new WideSearchError({
        code: "E_CONFIG",
        message: "missing keys",
        hint: "set a key",
        validValues: ["exa"],
      }),
    );
    expect(formatted.exitCode).toBe(3);
    expect(formatted.text).toContain("error[E_CONFIG]");
    expect(formatted.text).toContain("valid: exa");
    expect(formatted.text).toContain("hint: set a key");
  });
});
