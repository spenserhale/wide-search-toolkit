import {
  CREDENTIAL_KEYS,
  VENDOR_IDS,
  WideSearchError,
  vendorCredentialKeys,
  vendorForCredentialKey,
  type ResolvedConfig,
  type SecretStore,
  type VendorId,
} from "@wide-search-toolkit/sdk";

export function parseVendorId(raw: string): VendorId {
  const value = raw.trim().toLowerCase();
  if (!(VENDOR_IDS as readonly string[]).includes(value)) {
    throw new WideSearchError({
      code: "E_VALIDATION",
      message: "Unknown vendor",
      got: raw,
      validValues: VENDOR_IDS,
    });
  }
  return value as VendorId;
}

/** The keychain entry names to act on: one --key, or every key the vendor uses. */
export function selectCredentialKeys(vendor: VendorId, key: string | undefined): string[] {
  const keys = vendorCredentialKeys(vendor);
  if (key === undefined) return [...keys];
  const normalized = key.trim().toUpperCase();
  if (!keys.includes(normalized)) {
    throw new WideSearchError({
      code: "E_VALIDATION",
      message: `--key is not a credential for ${vendor}`,
      got: key,
      validValues: keys,
    });
  }
  return [normalized];
}

/** Sources that outrank the keychain, so a stored value would be ignored. */
function isShadowingSource(source: string | undefined): boolean {
  return source === "env" || (source?.startsWith("envfile:") ?? false);
}

export interface SetCredentialsInput {
  vendor: VendorId;
  keys: readonly string[];
  readValue: (key: string) => Promise<string>;
  store: SecretStore;
  config: ResolvedConfig;
  dryRun: boolean;
}

export interface SetCredentialsResult {
  vendor: VendorId;
  store: string;
  dry_run: boolean;
  credentials: Array<{ key: string; action: "stored" | "would_store"; shadowed_by?: string }>;
}

export async function setCredentials(input: SetCredentialsInput): Promise<SetCredentialsResult> {
  const values: Array<[string, string]> = [];
  for (const key of input.keys) {
    const value = (await input.readValue(key)).trim();
    if (!value) {
      throw new WideSearchError({
        code: "E_VALIDATION",
        message: `${key} must not be empty`,
        hint: "Paste the key at the prompt, or pipe it with --stdin.",
      });
    }
    values.push([key, value]);
  }
  const credentials: SetCredentialsResult["credentials"] = [];
  for (const [key, value] of values) {
    if (!input.dryRun) await input.store.set(key, value);
    const source = input.config.credentialSources[key];
    credentials.push({
      key,
      action: input.dryRun ? "would_store" : "stored",
      ...(isShadowingSource(source) ? { shadowed_by: source } : {}),
    });
  }
  return {
    vendor: input.vendor,
    store: input.store.description,
    dry_run: input.dryRun,
    credentials,
  };
}

export interface CredentialListRow {
  vendor: VendorId;
  key: string;
  keychain: "set" | "missing" | "unknown";
  active_source: string;
}

export interface ListCredentialsResult {
  store: string;
  keychain_status: string;
  keychain_error?: string;
  credentials: CredentialListRow[];
}

export async function listCredentials(
  store: SecretStore,
  config: ResolvedConfig,
): Promise<ListCredentialsResult> {
  let stored: Record<string, boolean> | null = null;
  let error: string | undefined;
  try {
    const entries = await Promise.all(
      CREDENTIAL_KEYS.map(async (key) => [key, Boolean(await store.get(key))] as const),
    );
    stored = Object.fromEntries(entries);
  } catch (caught) {
    error =
      caught instanceof WideSearchError ? (caught.got ?? caught.message) : String(caught);
  }
  return {
    store: store.description,
    keychain_status: stored ? "ok" : "unavailable",
    ...(error ? { keychain_error: error } : {}),
    credentials: CREDENTIAL_KEYS.map((key) => ({
      vendor: vendorForCredentialKey(key) as VendorId,
      key,
      keychain: stored ? (stored[key] ? "set" : "missing") : "unknown",
      active_source: config.credentialSources[key] ?? "missing",
    })),
  };
}

export interface DeleteCredentialsResult {
  vendor: VendorId;
  store: string;
  dry_run: boolean;
  credentials: Array<{ key: string; action: "deleted" | "not_found" | "would_delete" }>;
}

export async function deleteCredentials(input: {
  vendor: VendorId;
  keys: readonly string[];
  store: SecretStore;
  dryRun: boolean;
}): Promise<DeleteCredentialsResult> {
  const credentials: DeleteCredentialsResult["credentials"] = [];
  for (const key of input.keys) {
    if (input.dryRun) {
      credentials.push({ key, action: "would_delete" });
      continue;
    }
    const deleted = await input.store.delete(key);
    credentials.push({ key, action: deleted ? "deleted" : "not_found" });
  }
  return {
    vendor: input.vendor,
    store: input.store.description,
    dry_run: input.dryRun,
    credentials,
  };
}

export interface MigrateCredentialsResult {
  store: string;
  dry_run: boolean;
  credentials: Array<{
    vendor: VendorId;
    key: string;
    from: string;
    action: "stored" | "would_store" | "skipped_exists";
  }>;
  /** Plaintext files that still hold migrated keys; remove the lines yourself. */
  clean_up: string[];
}

function plaintextFile(source: string, config: ResolvedConfig): string | null {
  if (source.startsWith("envfile:")) return source.slice("envfile:".length);
  if (source.startsWith("config")) return config.configFile;
  return null;
}

/**
 * Copy keys whose winning source is a .env file or the user config file
 * into the store. Process-environment keys are left alone: they usually come
 * from op run or CI and are not plaintext at rest. Files are never edited.
 */
export async function migrateCredentials(input: {
  store: SecretStore;
  config: ResolvedConfig;
  dryRun: boolean;
  overwrite: boolean;
}): Promise<MigrateCredentialsResult> {
  const credentials: MigrateCredentialsResult["credentials"] = [];
  const cleanUp = new Set<string>();
  for (const key of CREDENTIAL_KEYS) {
    const source = input.config.credentialSources[key];
    if (!source) continue;
    const file = plaintextFile(source, input.config);
    if (!file) continue;
    const vendor = vendorForCredentialKey(key) as VendorId;
    const value = input.config.credentials[vendor][key];
    if (!value) continue;

    if (!input.overwrite && (await input.store.get(key))) {
      credentials.push({ vendor, key, from: source, action: "skipped_exists" });
      continue;
    }
    if (!input.dryRun) await input.store.set(key, value);
    credentials.push({ vendor, key, from: source, action: input.dryRun ? "would_store" : "stored" });
    cleanUp.add(file);
  }
  return {
    store: input.store.description,
    dry_run: input.dryRun,
    credentials,
    clean_up: [...cleanUp],
  };
}

export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
