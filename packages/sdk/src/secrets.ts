import { WideSearchError } from "./errors.js";
import { VENDOR_IDS, type VendorId } from "./types.js";

/** Service name every wide-search keychain entry is stored under. */
export const KEYCHAIN_SERVICE = "wide-search";

/**
 * A credential store keyed by env-var name (for example `EXA_API_KEY`).
 * The default implementation is the OS keychain via `Bun.secrets`; tests
 * inject an in-memory store.
 */
export interface SecretStore {
  readonly description: string;
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<boolean>;
}

/** Keychain entry names per vendor. Z.AI's `Z_AI_API_KEY` alias stays env-only. */
const VENDOR_CREDENTIAL_KEYS: Record<VendorId, readonly string[]> = {
  exa: ["EXA_API_KEY"],
  tavily: ["TAVILY_API_KEY"],
  parallel: ["PARALLEL_API_KEY"],
  perplexity: ["PERPLEXITY_API_KEY"],
  dataforseo: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
  zai: ["ZAI_API_KEY"],
  ollama: ["OLLAMA_API_KEY"],
  firecrawl: ["FIRECRAWL_API_KEY"],
  tinyfish: ["TINYFISH_API_KEY"],
};

export const CREDENTIAL_KEYS: readonly string[] = VENDOR_IDS.flatMap(
  (id) => VENDOR_CREDENTIAL_KEYS[id],
);

export function vendorCredentialKeys(id: VendorId): readonly string[] {
  return VENDOR_CREDENTIAL_KEYS[id];
}

export function vendorForCredentialKey(key: string): VendorId | undefined {
  return VENDOR_IDS.find((id) => VENDOR_CREDENTIAL_KEYS[id].includes(key));
}

interface BunSecretsApi {
  get(options: { service: string; name: string }): Promise<string | null>;
  set(options: { service: string; name: string; value: string }): Promise<void>;
  delete(options: { service: string; name: string }): Promise<boolean>;
}

function bunSecretsApi(): BunSecretsApi | undefined {
  const bun = (globalThis as { Bun?: { secrets?: BunSecretsApi } }).Bun;
  return bun?.secrets;
}

/** The OS keychain (macOS Keychain, libsecret, Windows Credential Manager) via Bun.secrets. */
export function bunSecretStore(service: string = KEYCHAIN_SERVICE): SecretStore {
  const api = (): BunSecretsApi => {
    const secrets = bunSecretsApi();
    if (!secrets) {
      throw new WideSearchError({
        code: "E_CONFIG",
        message: "The OS keychain is not available in this runtime",
        hint: "Run wide-search with Bun 1.3 or newer, or set keys through env, .env, or op run.",
      });
    }
    return secrets;
  };
  const wrap = async <T>(action: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof WideSearchError) throw error;
      throw new WideSearchError({
        code: "E_CONFIG",
        message: `Could not ${action} the OS keychain`,
        got: error instanceof Error ? error.message : String(error),
        hint:
          "On macOS, unlock the login keychain and allow access when prompted. On Linux, start a " +
          "Secret Service daemon (GNOME Keyring or KWallet). Otherwise set keys through env or op run.",
        cause: error,
      });
    }
  };
  return {
    description: `os-keychain:${service}`,
    get: (name) => wrap("read from", () => api().get({ service, name })),
    set: (name, value) => wrap("write to", () => api().set({ service, name, value })),
    delete: (name) => wrap("delete from", () => api().delete({ service, name })),
  };
}

export type KeychainStatus = "ok" | "disabled" | "unavailable";

export interface KeychainReadResult {
  status: KeychainStatus;
  values: Record<string, string>;
  error?: string;
}

/**
 * Read the given credential names in parallel. A store failure is reported
 * as `unavailable` instead of thrown so a missing keychain never breaks a
 * search that has keys from elsewhere.
 */
export async function readKeychainValues(
  store: SecretStore,
  names: readonly string[],
): Promise<KeychainReadResult> {
  try {
    const entries = await Promise.all(
      names.map(async (name) => [name, await store.get(name)] as const),
    );
    const values: Record<string, string> = {};
    for (const [name, value] of entries) {
      if (value) values[name] = value;
    }
    return { status: "ok", values };
  } catch (error) {
    return {
      status: "unavailable",
      values: {},
      error: error instanceof WideSearchError ? (error.got ?? error.message) : String(error),
    };
  }
}
