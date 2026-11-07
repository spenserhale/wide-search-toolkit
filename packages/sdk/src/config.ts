import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { WideSearchError } from "./errors.js";
import { VENDOR_IDS, type OutputFormat, type VendorId } from "./types.js";

export type Env = Record<string, string | undefined>;
export type VendorCredentials = Record<string, string | undefined>;
export type CredentialsByVendor = Record<VendorId, VendorCredentials>;

export interface ResolvedConfig {
  vendors: VendorId[];
  timeoutMs: number;
  maxPerVendor: number;
  budgetUsd: number;
  cacheTtlMs: number;
  cacheDir: string;
  fetchMaxChars: number;
  fetchTotalMaxChars: number;
  fetchConcurrency: number;
  fetchTimeoutMs: number;
  snippetChars: number;
  allowPrivateHosts: boolean;
  output: OutputFormat;
  userAgent: string;
  credentials: CredentialsByVendor;
  sources: Record<string, string>;
  credentialSources: Record<string, string>;
  envFiles: string[];
  configFile: string | null;
  cwd: string;
}

export interface ResolveConfigOptions {
  cwd?: string;
  env?: Env;
  /** Pass null to skip reading a user config file. */
  configFile?: string | null;
}

const ConfigFileSchema = z
  .object({
    vendors: z.array(z.enum(VENDOR_IDS)).optional(),
    timeoutMs: z.number().int().positive().optional(),
    maxPerVendor: z.number().int().min(1).max(20).optional(),
    budgetUsd: z.number().nonnegative().optional(),
    cacheTtlMs: z.number().int().nonnegative().optional(),
    cacheDir: z.string().optional(),
    fetchMaxChars: z.number().int().positive().optional(),
    fetchTotalMaxChars: z.number().int().positive().optional(),
    fetchConcurrency: z.number().int().min(1).max(10).optional(),
    fetchTimeoutMs: z.number().int().positive().optional(),
    snippetChars: z.number().int().positive().optional(),
    allowPrivateHosts: z.boolean().optional(),
    output: z.enum(["toon", "json", "csv", "text"]).optional(),
    userAgent: z.string().optional(),
    keys: z
      .object({
        exa: z.string().optional(),
        tavily: z.string().optional(),
        parallel: z.string().optional(),
        perplexity: z.string().optional(),
        dataforseo: z
          .object({
            login: z.string().optional(),
            password: z.string().optional(),
          })
          .optional(),
        zai: z.string().optional(),
        ollama: z.string().optional(),
        firecrawl: z.string().optional(),
        tinyfish: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

type ConfigFile = z.infer<typeof ConfigFileSchema>;

interface EnvFileData {
  files: string[];
  values: Env;
  sources: Record<string, string>;
}

interface ResolvedValue<T> {
  value: T;
  source: string;
}

const DEFAULTS = {
  timeoutMs: 8_000,
  maxPerVendor: 10,
  budgetUsd: 0.05,
  cacheTtlMs: 15 * 60 * 1_000,
  fetchMaxChars: 20_000,
  fetchTotalMaxChars: 100_000,
  fetchConcurrency: 4,
  fetchTimeoutMs: 15_000,
  snippetChars: 500,
  allowPrivateHosts: false,
  output: "toon" as OutputFormat,
  userAgent: "wide-search/0.1.0",
} as const;

const VENDOR_ENV_KEYS: Record<VendorId, readonly string[]> = {
  exa: ["EXA_API_KEY"],
  tavily: ["TAVILY_API_KEY"],
  parallel: ["PARALLEL_API_KEY"],
  perplexity: ["PERPLEXITY_API_KEY"],
  dataforseo: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
  zai: ["ZAI_API_KEY", "Z_AI_API_KEY"],
  ollama: ["OLLAMA_API_KEY"],
  firecrawl: ["FIRECRAWL_API_KEY"],
  tinyfish: ["TINYFISH_API_KEY"],
};

export function vendorEnvKeys(id: VendorId): readonly string[] {
  return VENDOR_ENV_KEYS[id];
}

export function isVendorConfigured(id: VendorId, credentials: CredentialsByVendor): boolean {
  const values = credentials[id];
  if (!values) return false;
  if (id === "dataforseo") {
    return Boolean(values.DATAFORSEO_LOGIN && values.DATAFORSEO_PASSWORD);
  }
  if (id === "zai") {
    return Boolean(values.ZAI_API_KEY);
  }
  const key = VENDOR_ENV_KEYS[id][0];
  return Boolean(key && values[key]);
}

export function configuredVendorIds(credentials: CredentialsByVendor): VendorId[] {
  return VENDOR_IDS.filter((id) => isVendorConfigured(id, credentials));
}

export function resolveConfig(options: ResolveConfigOptions = {}): ResolvedConfig {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const envFile = readEnvFiles(cwd);
  const configFile = readConfigFile(options, env, envFile.values);

  const sources: Record<string, string> = {};

  const pickEnv = (names: readonly string[]): ResolvedValue<string> | null => {
    for (const name of names) {
      const fromProcess = env[name];
      if (fromProcess !== undefined && fromProcess !== "") {
        return { value: fromProcess, source: "env" };
      }
      const fromFile = envFile.values[name];
      if (fromFile !== undefined && fromFile !== "") {
        return { value: fromFile, source: `envfile:${envFile.sources[name] ?? "unknown"}` };
      }
    }
    return null;
  };

  const resolveString = (
    key: string,
    envNames: readonly string[],
    configValue: string | undefined,
    defaultValue: string,
  ): string => {
    const fromEnv = pickEnv(envNames);
    if (fromEnv) {
      sources[key] = fromEnv.source;
      return fromEnv.value;
    }
    if (configValue !== undefined && configValue !== "") {
      sources[key] = configFile ? `config:${configFile.path}` : "config";
      return configValue;
    }
    sources[key] = "default";
    return defaultValue;
  };

  const resolveNumber = (
    key: string,
    envNames: readonly string[],
    configValue: number | undefined,
    defaultValue: number,
    bounds: { min: number; max: number },
  ): number => {
    const raw = pickEnv(envNames);
    const value = raw ? Number(raw.value) : (configValue ?? defaultValue);
    if (!Number.isFinite(value) || value < bounds.min || value > bounds.max) {
      throw new WideSearchError({
        code: "E_CONFIG",
        message: `${key} is out of range`,
        got: raw?.value ?? String(value),
        hint: `Expected a number between ${bounds.min} and ${bounds.max}.`,
      });
    }
    sources[key] = raw?.source ?? (configValue !== undefined ? "config" : "default");
    return value;
  };

  const resolveBoolean = (
    key: string,
    envNames: readonly string[],
    configValue: boolean | undefined,
    defaultValue: boolean,
  ): boolean => {
    const raw = pickEnv(envNames);
    if (!raw) {
      sources[key] = configValue !== undefined ? "config" : "default";
      return configValue ?? defaultValue;
    }
    const normalized = raw.value.trim().toLowerCase();
    const value = ["1", "true", "yes", "on"].includes(normalized)
      ? true
      : ["0", "false", "no", "off"].includes(normalized)
        ? false
        : undefined;
    if (value === undefined) {
      throw new WideSearchError({
        code: "E_CONFIG",
        message: `${key} is not a boolean`,
        got: raw.value,
        validValues: ["1", "0", "true", "false", "yes", "no", "on", "off"],
      });
    }
    sources[key] = raw.source;
    return value;
  };

  const resolveVendors = (): VendorId[] => {
    const raw = pickEnv(["WIDE_SEARCH_VENDORS"]);
    if (raw) {
      sources.vendors = raw.source;
      return parseVendorList(raw.value);
    }
    if (configFile?.data.vendors?.length) {
      sources.vendors = `config:${configFile.path}`;
      return configFile.data.vendors;
    }
    sources.vendors = "default";
    return [...VENDOR_IDS];
  };

  const resolvedCredentials = resolveCredentials(pickEnv, configFile);
  const credentials = resolvedCredentials.credentials;
  const credentialSources = resolvedCredentials.sources;

  const outputRaw = resolveString(
    "output",
    ["WIDE_SEARCH_OUTPUT"],
    configFile?.data.output,
    DEFAULTS.output,
  );
  if (!["toon", "json", "csv", "text"].includes(outputRaw)) {
    throw new WideSearchError({
      code: "E_CONFIG",
      message: "WIDE_SEARCH_OUTPUT is not a known format",
      got: outputRaw,
      validValues: ["toon", "json", "csv", "text"],
    });
  }

  return {
    vendors: resolveVendors(),
    timeoutMs: resolveNumber(
      "timeoutMs",
      ["WIDE_SEARCH_TIMEOUT_MS"],
      configFile?.data.timeoutMs,
      DEFAULTS.timeoutMs,
      { min: 100, max: 120_000 },
    ),
    maxPerVendor: resolveNumber(
      "maxPerVendor",
      ["WIDE_SEARCH_MAX_PER_VENDOR"],
      configFile?.data.maxPerVendor,
      DEFAULTS.maxPerVendor,
      { min: 1, max: 20 },
    ),
    budgetUsd: resolveNumber(
      "budgetUsd",
      ["WIDE_SEARCH_MAX_COST_USD", "WIDE_SEARCH_BUDGET_USD"],
      configFile?.data.budgetUsd,
      DEFAULTS.budgetUsd,
      { min: 0, max: 100 },
    ),
    cacheTtlMs: resolveNumber(
      "cacheTtlMs",
      ["WIDE_SEARCH_CACHE_TTL_MS"],
      configFile?.data.cacheTtlMs,
      DEFAULTS.cacheTtlMs,
      { min: 0, max: 7 * 24 * 60 * 60 * 1_000 },
    ),
    cacheDir: resolveString(
      "cacheDir",
      ["WIDE_SEARCH_CACHE_DIR"],
      configFile?.data.cacheDir,
      defaultCacheDir(env),
    ).replace(/^~(?=$|\/)/, homedir()),
    fetchMaxChars: resolveNumber(
      "fetchMaxChars",
      ["WIDE_SEARCH_FETCH_MAX_CHARS"],
      configFile?.data.fetchMaxChars,
      DEFAULTS.fetchMaxChars,
      { min: 1_000, max: 200_000 },
    ),
    fetchTotalMaxChars: resolveNumber(
      "fetchTotalMaxChars",
      ["WIDE_SEARCH_FETCH_TOTAL_MAX_CHARS"],
      configFile?.data.fetchTotalMaxChars,
      DEFAULTS.fetchTotalMaxChars,
      { min: 1_000, max: 1_000_000 },
    ),
    fetchConcurrency: resolveNumber(
      "fetchConcurrency",
      ["WIDE_SEARCH_FETCH_CONCURRENCY"],
      configFile?.data.fetchConcurrency,
      DEFAULTS.fetchConcurrency,
      { min: 1, max: 10 },
    ),
    fetchTimeoutMs: resolveNumber(
      "fetchTimeoutMs",
      ["WIDE_SEARCH_FETCH_TIMEOUT_MS"],
      configFile?.data.fetchTimeoutMs,
      DEFAULTS.fetchTimeoutMs,
      { min: 100, max: 120_000 },
    ),
    snippetChars: resolveNumber(
      "snippetChars",
      ["WIDE_SEARCH_SNIPPET_CHARS"],
      configFile?.data.snippetChars,
      DEFAULTS.snippetChars,
      { min: 80, max: 4_000 },
    ),
    allowPrivateHosts: resolveBoolean(
      "allowPrivateHosts",
      ["WIDE_SEARCH_ALLOW_PRIVATE_HOSTS"],
      configFile?.data.allowPrivateHosts,
      DEFAULTS.allowPrivateHosts,
    ),
    output: outputRaw as OutputFormat,
    userAgent: resolveString(
      "userAgent",
      ["WIDE_SEARCH_USER_AGENT"],
      configFile?.data.userAgent,
      DEFAULTS.userAgent,
    ),
    credentials,
    sources,
    credentialSources,
    envFiles: envFile.files,
    configFile: configFile?.path ?? null,
    cwd,
  };
}

function parseVendorList(raw: string): VendorId[] {
  const values = raw
    .split(/[,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<VendorId>();
  for (const value of values) {
    if (!(VENDOR_IDS as readonly string[]).includes(value)) {
      throw new WideSearchError({
        code: "E_CONFIG",
        message: "WIDE_SEARCH_VENDORS contains an unknown vendor",
        got: value,
        validValues: VENDOR_IDS,
      });
    }
    seen.add(value as VendorId);
  }
  if (seen.size === 0) {
    throw new WideSearchError({
      code: "E_CONFIG",
      message: "WIDE_SEARCH_VENDORS is empty",
      hint: "Set it to a comma-separated list, or unset it to use every configured vendor.",
    });
  }
  return [...seen];
}

function resolveCredentials(
  pickEnv: (names: readonly string[]) => ResolvedValue<string> | null,
  configFile: { path: string; data: ConfigFile } | null,
): { credentials: CredentialsByVendor; sources: Record<string, string> } {
  const sources: Record<string, string> = {};
  const from = (
    key: string,
    envNames: readonly string[],
    configValue?: string,
  ): string | undefined => {
    const envValue = pickEnv(envNames);
    if (envValue) {
      sources[key] = envValue.source;
      return envValue.value;
    }
    if (configValue) {
      sources[key] = configFile ? `config:${configFile.path}` : "config";
      return configValue;
    }
    sources[key] = "missing";
    return undefined;
  };

  const dataforseoLogin = from(
    "DATAFORSEO_LOGIN",
    ["DATAFORSEO_LOGIN"],
    configFile?.data.keys?.dataforseo?.login,
  );
  const dataforseoPassword = from(
    "DATAFORSEO_PASSWORD",
    ["DATAFORSEO_PASSWORD"],
    configFile?.data.keys?.dataforseo?.password,
  );
  const zai = from(
    "ZAI_API_KEY",
    ["ZAI_API_KEY", "Z_AI_API_KEY"],
    configFile?.data.keys?.zai,
  );

  return {
    credentials: {
      exa: { EXA_API_KEY: from("EXA_API_KEY", ["EXA_API_KEY"], configFile?.data.keys?.exa) },
      tavily: {
        TAVILY_API_KEY: from("TAVILY_API_KEY", ["TAVILY_API_KEY"], configFile?.data.keys?.tavily),
      },
      parallel: {
        PARALLEL_API_KEY: from(
          "PARALLEL_API_KEY",
          ["PARALLEL_API_KEY"],
          configFile?.data.keys?.parallel,
        ),
      },
      perplexity: {
        PERPLEXITY_API_KEY: from(
          "PERPLEXITY_API_KEY",
          ["PERPLEXITY_API_KEY"],
          configFile?.data.keys?.perplexity,
        ),
      },
      dataforseo: {
        DATAFORSEO_LOGIN: dataforseoLogin,
        DATAFORSEO_PASSWORD: dataforseoPassword,
      },
      zai: { ZAI_API_KEY: zai },
      ollama: {
        OLLAMA_API_KEY: from("OLLAMA_API_KEY", ["OLLAMA_API_KEY"], configFile?.data.keys?.ollama),
      },
      firecrawl: {
        FIRECRAWL_API_KEY: from(
          "FIRECRAWL_API_KEY",
          ["FIRECRAWL_API_KEY"],
          configFile?.data.keys?.firecrawl,
        ),
      },
      tinyfish: {
        TINYFISH_API_KEY: from(
          "TINYFISH_API_KEY",
          ["TINYFISH_API_KEY"],
          configFile?.data.keys?.tinyfish,
        ),
      },
    },
    sources,
  };
}

function readEnvFiles(cwd: string): EnvFileData {
  const files: string[] = [];
  let current = cwd;
  while (true) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) files.push(candidate);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // Nearest .env wins, so apply parent files first.
  files.reverse();

  const values: Env = {};
  const sources: Record<string, string> = {};
  for (const file of files) {
    const parsed = parseEnvFile(file);
    for (const [key, value] of Object.entries(parsed)) {
      values[key] = value;
      sources[key] = file;
    }
  }
  return { files, values, sources };
}

function parseEnvFile(path: string): Env {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const values: Env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const unexported = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const equals = unexported.indexOf("=");
    if (equals <= 0) continue;
    const key = unexported.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = unexported.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const comment = value.indexOf(" #");
      if (comment >= 0) value = value.slice(0, comment).trim();
    }
    values[key] = value.replace(/\\n/g, "\n");
  }
  return values;
}

function readConfigFile(
  options: ResolveConfigOptions,
  env: Env,
  envFileValues: Env,
): { path: string; data: ConfigFile } | null {
  if (options.configFile === null) return null;
  const path = (
    options.configFile ??
    env.WIDE_SEARCH_CONFIG_FILE ??
    envFileValues.WIDE_SEARCH_CONFIG_FILE ??
    join(configRoot(env), "wide-search", "config.json")
  ).replace(/^~(?=$|\/)/, homedir());
  if (!existsSync(path)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new WideSearchError({
      code: "E_CONFIG",
      message: `Config file at ${path} is not valid JSON`,
      hint: "Fix the JSON or remove the file.",
      cause: error,
    });
  }
  const parsed = ConfigFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new WideSearchError({
      code: "E_CONFIG",
      message: `Config file at ${path} does not match the expected shape`,
      got: parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    });
  }
  return { path, data: parsed.data };
}

function configRoot(env: Env): string {
  return env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

function defaultCacheDir(env: Env): string {
  return join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "wide-search");
}

export interface RedactedConfig {
  schema_version: "1";
  cwd: string;
  config_file: string | null;
  env_files: string[];
  values: Record<string, unknown>;
  sources: Record<string, string>;
  credentials: Record<VendorId, Record<string, "set" | "missing">>;
  credential_sources: Record<string, string>;
  vendors_configured: VendorId[];
}

export function redactedConfig(config: ResolvedConfig): RedactedConfig {
  const credentials = {} as Record<VendorId, Record<string, "set" | "missing">>;
  for (const id of VENDOR_IDS) {
    credentials[id] = {};
    for (const [key, value] of Object.entries(config.credentials[id])) {
      credentials[id][key] = value ? "set" : "missing";
    }
  }
  return {
    schema_version: "1",
    cwd: config.cwd,
    config_file: config.configFile,
    env_files: config.envFiles,
    values: {
      vendors: config.vendors,
      timeoutMs: config.timeoutMs,
      maxPerVendor: config.maxPerVendor,
      budgetUsd: config.budgetUsd,
      cacheTtlMs: config.cacheTtlMs,
      cacheDir: config.cacheDir,
      fetchMaxChars: config.fetchMaxChars,
      fetchTotalMaxChars: config.fetchTotalMaxChars,
      fetchConcurrency: config.fetchConcurrency,
      fetchTimeoutMs: config.fetchTimeoutMs,
      snippetChars: config.snippetChars,
      allowPrivateHosts: config.allowPrivateHosts,
      output: config.output,
      userAgent: config.userAgent,
    },
    sources: config.sources,
    credentials,
    credential_sources: config.credentialSources,
    vendors_configured: configuredVendorIds(config.credentials),
  };
}
