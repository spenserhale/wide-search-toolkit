import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configuredVendorIds, redactedConfig, resolveConfig } from "../src/config.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "wide-search-config-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("resolveConfig", () => {
  it("uses defaults when nothing is configured", () => {
    const cwd = tempDir();
    const config = resolveConfig({ cwd, env: {}, configFile: null });
    expect(config.vendors).toContain("exa");
    expect(config.timeoutMs).toBe(8_000);
    expect(config.budgetUsd).toBe(0.05);
    expect(config.sources.timeoutMs).toBe("default");
  });

  it("prefers environment variables over .env files and config files", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), "WIDE_SEARCH_TIMEOUT_MS=1111\nEXA_API_KEY=from-env-file\n");
    const configFile = join(cwd, "config.json");
    writeFileSync(
      configFile,
      JSON.stringify({ timeoutMs: 2222, keys: { exa: "from-config" } }),
    );

    const config = resolveConfig({
      cwd,
      env: { WIDE_SEARCH_TIMEOUT_MS: "3333", EXA_API_KEY: "from-process" },
      configFile,
    });

    expect(config.timeoutMs).toBe(3333);
    expect(config.credentials.exa.EXA_API_KEY).toBe("from-process");
    expect(config.sources.timeoutMs).toBe("env");
    expect(config.credentialSources.EXA_API_KEY).toBe("env");
  });

  it("uses the nearest .env when the same key appears in a parent", () => {
    const root = tempDir();
    const child = join(root, "child");
    mkdirSync(child);
    writeFileSync(join(root, ".env"), "EXA_API_KEY=parent\n");
    writeFileSync(join(child, ".env"), "EXA_API_KEY=child\n");

    const config = resolveConfig({ cwd: child, env: {}, configFile: null });
    expect(config.credentials.exa.EXA_API_KEY).toBe("child");
    expect(config.credentialSources.EXA_API_KEY).toContain("child/.env");
  });

  it("reads credentials from a config file and reports configured vendors", () => {
    const cwd = tempDir();
    const configFile = join(cwd, "config.json");
    writeFileSync(
      configFile,
      JSON.stringify({
        keys: {
          parallel: "parallel-key",
          dataforseo: { login: "login", password: "password" },
        },
      }),
    );

    const config = resolveConfig({ cwd, env: {}, configFile });
    expect(config.credentials.parallel.PARALLEL_API_KEY).toBe("parallel-key");
    expect(config.credentials.dataforseo.DATAFORSEO_LOGIN).toBe("login");
    expect(configuredVendorIds(config.credentials)).toEqual(["parallel", "dataforseo"]);
  });

  it("redacts secrets in the display view", () => {
    const config = resolveConfig({
      cwd: tempDir(),
      env: { EXA_API_KEY: "super-secret" },
      configFile: null,
    });
    const redacted = redactedConfig(config);
    expect(redacted.credentials.exa.EXA_API_KEY).toBe("set");
    expect(JSON.stringify(redacted)).not.toContain("super-secret");
  });

  it("rejects an unknown vendor in WIDE_SEARCH_VENDORS", () => {
    expect(() =>
      resolveConfig({
        cwd: tempDir(),
        env: { WIDE_SEARCH_VENDORS: "exa,nope" },
        configFile: null,
      }),
    ).toThrow();
  });
});

describe("placeholder credentials", () => {
  it("parses a .env comment right after = as an empty value", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), "PERPLEXITY_API_KEY= # paste key here\nEXA_API_KEY=real # note\n");
    const config = resolveConfig({ cwd, env: {}, configFile: null });
    expect(config.credentials.perplexity.PERPLEXITY_API_KEY).toBeUndefined();
    expect(config.credentialSources.PERPLEXITY_API_KEY).toBe("missing");
    expect(config.credentials.exa.EXA_API_KEY).toBe("real");
    expect(configuredVendorIds(config.credentials)).toEqual(["exa"]);
  });

  const placeholders: Array<[string, string]> = [
    ["   ", "blank"],
    ["#nope", "comment, not a key"],
    ["op://Private/Perplexity/credential", "unresolved 1Password reference"],
    ["${PERPLEXITY_API_KEY}", "unexpanded variable reference"],
    ["$PERPLEXITY_API_KEY", "unexpanded variable reference"],
  ];
  for (const [value, reason] of placeholders) {
    it(`ignores ${JSON.stringify(value)} from the environment`, () => {
      const config = resolveConfig({
        cwd: tempDir(),
        env: { PERPLEXITY_API_KEY: value },
        configFile: null,
      });
      expect(config.credentials.perplexity.PERPLEXITY_API_KEY).toBeUndefined();
      expect(configuredVendorIds(config.credentials)).not.toContain("perplexity");
      expect(config.credentialSources.PERPLEXITY_API_KEY).toStartWith("ignored:env (");
      expect(config.credentialSources.PERPLEXITY_API_KEY).toContain(reason);
    });
  }

  it("ignores placeholders in .env and the config file", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), "EXA_API_KEY=op://Private/Exa/default\n");
    const configFile = join(cwd, "config.json");
    writeFileSync(configFile, JSON.stringify({ keys: { tavily: "${TAVILY_API_KEY}" } }));
    const config = resolveConfig({ cwd, env: {}, configFile });
    expect(configuredVendorIds(config.credentials)).toEqual([]);
    expect(config.credentialSources.EXA_API_KEY).toStartWith("ignored:envfile:");
    expect(config.credentialSources.TAVILY_API_KEY).toStartWith(`ignored:config:${configFile}`);
  });

  it("falls through a placeholder to a real key in a lower-precedence source", () => {
    const cwd = tempDir();
    const configFile = join(cwd, "config.json");
    writeFileSync(configFile, JSON.stringify({ keys: { perplexity: "pplx-real" } }));
    const config = resolveConfig({
      cwd,
      env: { PERPLEXITY_API_KEY: "op://Private/Perplexity/credential" },
      configFile,
    });
    expect(config.credentials.perplexity.PERPLEXITY_API_KEY).toBe("pplx-real");
    expect(config.credentialSources.PERPLEXITY_API_KEY).toBe(`config:${configFile}`);
  });

  it("trims usable credential values", () => {
    const config = resolveConfig({
      cwd: tempDir(),
      env: { EXA_API_KEY: "  exa-key\n" },
      configFile: null,
    });
    expect(config.credentials.exa.EXA_API_KEY).toBe("exa-key");
  });
});
