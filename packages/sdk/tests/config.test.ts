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
