import { WideSearchError } from "../errors.js";

export interface JsonRequestOptions {
  vendor: string;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  signal: AbortSignal;
  userAgent: string;
}

function isAbort(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    ((error as { name?: unknown }).name === "AbortError" ||
      (error as { name?: unknown }).name === "TimeoutError")
  );
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1_000));
}

function truncate(value: string, max = 500): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

/**
 * Shared JSON request helper. It maps HTTP and transport failures to the
 * enumerated error codes so adapters only parse successful payloads.
 */
export async function requestJson(options: JsonRequestOptions): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": options.userAgent,
    ...options.headers,
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(options.url, {
      method: options.method ?? "POST",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (isAbort(error)) {
      throw new WideSearchError({
        code: "E_TIMEOUT",
        message: `${options.vendor} did not answer before the timeout`,
        hint: "Raise --timeout-ms or reduce the number of selected vendors.",
        cause: error,
      });
    }
    throw new WideSearchError({
      code: "E_NETWORK",
      message: `${options.vendor} request failed`,
      hint: "Check the vendor status page and your network connection.",
      cause: error,
    });
  }

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
    const code =
      response.status === 401 || response.status === 403
        ? "E_AUTH"
        : response.status === 429
          ? "E_RATE_LIMIT"
          : response.status >= 500
            ? "E_NETWORK"
            : "E_VALIDATION";
    throw new WideSearchError({
      code,
      message: `${options.vendor} returned HTTP ${response.status}`,
      got: truncate(text),
      statusCode: response.status,
      retryAfterSeconds,
      hint:
        code === "E_AUTH"
          ? `Check the ${options.vendor} API key in your environment or config file.`
          : code === "E_RATE_LIMIT"
            ? "The vendor rate-limited this request; retry later."
            : undefined,
    });
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new WideSearchError({
      code: "E_NETWORK",
      message: `${options.vendor} returned a non-JSON response`,
      got: truncate(text),
      cause: error,
    });
  }
}

export function isoDaysAgo(days: number, now = Date.now()): string {
  return new Date(now - days * 24 * 60 * 60 * 1_000).toISOString();
}

export function dateDaysAgo(days: number, now = Date.now()): string {
  return isoDaysAgo(days, now).slice(0, 10);
}

export const FRESHNESS_DAYS = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
} as const;
