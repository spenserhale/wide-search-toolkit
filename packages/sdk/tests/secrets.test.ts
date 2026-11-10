import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, resolveConfig } from "../src/config.js";
import { CREDENTIAL_KEYS, readKeychainValues, type SecretStore } from "../src/secrets.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "wide-search-secrets-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function memoryStore(initial: Record<string, string> = {}): SecretStore & {
  requested: string[];
} {
  const values = new Map(Object.entries(initial));
  const requested: string[] = [];
  return {
    description: "memory",
    requested,
    async get(name) {
      requested.push(name);
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

function failingStore(): SecretStore {
  const fail = async (): Promise<never> => {
    throw new Error("no secret service");
  };
  return { description: "failing", get: fail, set: fail, delete: fail };
}

describe("keychain credential resolution", () => {
  it("resolves a key from the keychain when env and .env are empty", async () => {
    const config = await loadConfig({
      cwd: tempDir(),
      env: {},
      configFile: null,
      secretStore: memoryStore({ EXA_API_KEY: "from-keychain" }),
    });
    expect(config.credentials.exa.EXA_API_KEY).toBe("from-keychain");
    expect(config.credentialSources.EXA_API_KEY).toBe("keychain");
    expect(config.keychain.status).toBe("ok");
  });

  it("ranks env and .env above the keychain and the keychain above the config file", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), "TAVILY_API_KEY=from-env-file\n");
    const configFile = join(cwd, "config.json");
    writeFileSync(
      configFile,
      JSON.stringify({ keys: { exa: "c", tavily: "c", parallel: "from-config", firecrawl: "c" } }),
    );
    const config = resolveConfig({
      cwd,
      env: { EXA_API_KEY: "from-process" },
      configFile,
      keychainValues: {
        EXA_API_KEY: "k",
        TAVILY_API_KEY: "k",
        FIRECRAWL_API_KEY: "from-keychain",
      },
    });
    expect(config.credentials.exa.EXA_API_KEY).toBe("from-process");
    expect(config.credentials.tavily.TAVILY_API_KEY).toBe("from-env-file");
    expect(config.credentials.firecrawl.FIRECRAWL_API_KEY).toBe("from-keychain");
    expect(config.credentials.parallel.PARALLEL_API_KEY).toBe("from-config");
    expect(config.credentialSources.FIRECRAWL_API_KEY).toBe("keychain");
  });

  it("only asks the keychain for keys env and .env did not supply", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), "TAVILY_API_KEY=from-env-file\n");
    const store = memoryStore();
    await loadConfig({ cwd, env: { EXA_API_KEY: "x" }, configFile: null, secretStore: store });
    expect(store.requested).not.toContain("EXA_API_KEY");
    expect(store.requested).not.toContain("TAVILY_API_KEY");
    expect(store.requested).toContain("PARALLEL_API_KEY");
    expect(store.requested).toHaveLength(CREDENTIAL_KEYS.length - 2);
  });

  it("skips the keychain when WIDE_SEARCH_KEYCHAIN=0", async () => {
    const store = memoryStore({ EXA_API_KEY: "from-keychain" });
    const config = await loadConfig({
      cwd: tempDir(),
      env: { WIDE_SEARCH_KEYCHAIN: "0" },
      configFile: null,
      secretStore: store,
    });
    expect(store.requested).toHaveLength(0);
    expect(config.credentials.exa.EXA_API_KEY).toBeUndefined();
    expect(config.keychain.status).toBe("disabled");
  });

  it("reports an unavailable keychain without failing", async () => {
    const config = await loadConfig({
      cwd: tempDir(),
      env: { EXA_API_KEY: "from-process" },
      configFile: null,
      secretStore: failingStore(),
    });
    expect(config.keychain.status).toBe("unavailable");
    expect(config.keychain.error).toContain("no secret service");
    expect(config.credentials.exa.EXA_API_KEY).toBe("from-process");
  });

  it("reads keys in parallel and drops empty values", async () => {
    const result = await readKeychainValues(memoryStore({ EXA_API_KEY: "a", TAVILY_API_KEY: "" }), [
      "EXA_API_KEY",
      "TAVILY_API_KEY",
    ]);
    expect(result).toEqual({ status: "ok", values: { EXA_API_KEY: "a" } });
  });
});
