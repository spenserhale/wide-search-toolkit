import { describe, expect, it } from "bun:test";
import { resolveConfig, type SecretStore } from "@wide-search-toolkit/sdk";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteCredentials,
  listCredentials,
  migrateCredentials,
  parseVendorId,
  selectCredentialKeys,
  setCredentials,
} from "../src/lib/auth.js";

function memoryStore(initial: Record<string, string> = {}): SecretStore & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    description: "memory",
    values,
    async get(name) {
      return values.get(name) ?? null;
    },
    async set(name, value) {
      values.set(name, value);
    },
    async delete(name) {
      return values.delete(name);
    },
  };
}

function emptyConfig(env: Record<string, string> = {}) {
  return resolveConfig({ cwd: mkdtempSync(join(tmpdir(), "ws-auth-")), env, configFile: null });
}

describe("auth helpers", () => {
  it("validates vendor ids and --key", () => {
    expect(parseVendorId("EXA")).toBe("exa");
    expect(() => parseVendorId("bing")).toThrow("Unknown vendor");
    expect(selectCredentialKeys("dataforseo", undefined)).toEqual([
      "DATAFORSEO_LOGIN",
      "DATAFORSEO_PASSWORD",
    ]);
    expect(selectCredentialKeys("dataforseo", "dataforseo_password")).toEqual([
      "DATAFORSEO_PASSWORD",
    ]);
    expect(() => selectCredentialKeys("exa", "TAVILY_API_KEY")).toThrow("not a credential");
  });

  it("stores trimmed values and flags keys that env still overrides", async () => {
    const store = memoryStore();
    const result = await setCredentials({
      vendor: "exa",
      keys: ["EXA_API_KEY"],
      readValue: async () => "  secret-value\n",
      store,
      config: emptyConfig({ EXA_API_KEY: "from-shell" }),
      dryRun: false,
    });
    expect(store.values.get("EXA_API_KEY")).toBe("secret-value");
    expect(result.credentials).toEqual([
      { key: "EXA_API_KEY", action: "stored", shadowed_by: "env" },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("does not write on --dry-run and rejects empty input", async () => {
    const store = memoryStore();
    const dry = await setCredentials({
      vendor: "exa",
      keys: ["EXA_API_KEY"],
      readValue: async () => "v",
      store,
      config: emptyConfig(),
      dryRun: true,
    });
    expect(dry.credentials[0]?.action).toBe("would_store");
    expect(store.values.size).toBe(0);
    await expect(
      setCredentials({
        vendor: "exa",
        keys: ["EXA_API_KEY"],
        readValue: async () => "  \n",
        store,
        config: emptyConfig(),
        dryRun: false,
      }),
    ).rejects.toThrow("must not be empty");
  });

  it("lists keychain state and active source without values", async () => {
    const store = memoryStore({ TAVILY_API_KEY: "tv-secret" });
    const result = await listCredentials(store, emptyConfig({ EXA_API_KEY: "x" }));
    const exa = result.credentials.find((row) => row.key === "EXA_API_KEY");
    const tavily = result.credentials.find((row) => row.key === "TAVILY_API_KEY");
    expect(exa).toEqual({ vendor: "exa", key: "EXA_API_KEY", keychain: "missing", active_source: "env" });
    expect(tavily?.keychain).toBe("set");
    expect(JSON.stringify(result)).not.toContain("tv-secret");
  });

  it("deletes entries and reports missing ones", async () => {
    const store = memoryStore({ DATAFORSEO_LOGIN: "l" });
    const result = await deleteCredentials({
      vendor: "dataforseo",
      keys: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
      store,
      dryRun: false,
    });
    expect(result.credentials.map((row) => row.action)).toEqual(["deleted", "not_found"]);
    expect(store.values.size).toBe(0);
  });

  it("migrates .env and config-file keys, skips existing ones, and leaves env alone", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ws-migrate-"));
    writeFileSync(join(cwd, ".env"), "EXA_API_KEY=exa-from-file\nTAVILY_API_KEY=tv-from-file\n");
    const configFile = join(cwd, "config.json");
    writeFileSync(configFile, JSON.stringify({ keys: { firecrawl: "fc-from-config" } }));
    const config = resolveConfig({ cwd, env: { PARALLEL_API_KEY: "from-op-run" }, configFile });
    const store = memoryStore({ TAVILY_API_KEY: "already-there" });

    const dry = await migrateCredentials({ store, config, dryRun: true, overwrite: false });
    expect(dry.credentials.map((row) => `${row.key}:${row.action}`)).toEqual([
      "EXA_API_KEY:would_store",
      "TAVILY_API_KEY:skipped_exists",
      "FIRECRAWL_API_KEY:would_store",
    ]);
    expect(store.values.has("EXA_API_KEY")).toBe(false);

    const result = await migrateCredentials({ store, config, dryRun: false, overwrite: false });
    expect(store.values.get("EXA_API_KEY")).toBe("exa-from-file");
    expect(store.values.get("FIRECRAWL_API_KEY")).toBe("fc-from-config");
    expect(store.values.get("TAVILY_API_KEY")).toBe("already-there");
    expect(store.values.has("PARALLEL_API_KEY")).toBe(false);
    expect(result.clean_up.sort()).toEqual([configFile, join(cwd, ".env")].sort());
  });
});
