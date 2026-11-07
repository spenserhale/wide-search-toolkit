import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { WideSearchError, isWideSearchError } from "./errors.js";
import type { FetchPage, FetchReport } from "./types.js";

export interface FetchPagesOptions {
  urls: readonly string[];
  maxCharsPerPage?: number;
  maxTotalChars?: number;
  timeoutMs?: number;
  concurrency?: number;
  allowPrivateHosts?: boolean;
  userAgent?: string;
  signal?: AbortSignal;
}

interface SafeTarget {
  url: URL;
  addresses: Array<{ address: string; family: number }>;
}

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  truncated: boolean;
  redirect?: string;
}

const MAX_URLS = 20;
const MAX_REDIRECTS = 5;
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

/**
 * Fetch full page text for a bounded list of public HTTP(S) URLs. The guard
 * blocks loopback, private, link-local, multicast, reserved, metadata, and
 * IPv4-mapped IPv6 destinations unless `allowPrivateHosts` is explicitly set.
 * DNS is resolved once and the chosen address is pinned into the connection to
 * shrink the DNS-rebinding window.
 */
export async function fetchPages(options: FetchPagesOptions): Promise<FetchReport> {
  const urls = uniqueUrls(options.urls);
  if (urls.length === 0) {
    throw new WideSearchError({
      code: "E_VALIDATION",
      message: "fetch needs at least one URL",
      hint: "Pass a URL as a positional argument or repeat --url.",
    });
  }
  if (urls.length > MAX_URLS) {
    throw new WideSearchError({
      code: "E_VALIDATION",
      message: `fetch accepts at most ${MAX_URLS} URLs per call`,
      got: String(urls.length),
      hint: "Split the list into smaller batches.",
    });
  }

  const maxCharsPerPage = options.maxCharsPerPage ?? 20_000;
  const maxTotalChars = options.maxTotalChars ?? 100_000;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const concurrency = options.concurrency ?? 4;
  for (const [name, value] of [
    ["max_chars_per_page", maxCharsPerPage],
    ["max_total_chars", maxTotalChars],
    ["timeout_ms", timeoutMs],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new WideSearchError({
        code: "E_VALIDATION",
        message: `${name} must be a positive integer`,
        got: String(value),
      });
    }
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
    throw new WideSearchError({
      code: "E_VALIDATION",
      message: "concurrency must be an integer between 1 and 10",
      got: String(concurrency),
    });
  }
  const allowPrivateHosts = options.allowPrivateHosts === true;
  const userAgent = options.userAgent ?? "wide-search/0.1.0";
  const started = performance.now();

  const pages: FetchPage[] = new Array(urls.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= urls.length) return;
      const url = urls[index];
      if (!url) return;
      pages[index] = await fetchOne(url, {
        maxCharsPerPage,
        timeoutMs,
        allowPrivateHosts,
        userAgent,
        signal: options.signal,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()),
  );

  const capSuffix = "\n\n[truncated by total character cap]";
  let usedChars = 0;
  for (const page of pages) {
    if (!page || !page.text) continue;
    const remaining = maxTotalChars - usedChars;
    if (remaining <= 0) {
      page.text = "";
      page.total_cap_reached = true;
      page.truncated = true;
      continue;
    }
    if (page.text.length > remaining) {
      const available = remaining - capSuffix.length;
      page.text =
        available > 0
          ? `${page.text.slice(0, available)}${capSuffix}`
          : page.text.slice(0, remaining);
      page.truncated = true;
      page.total_cap_reached = true;
      usedChars = maxTotalChars;
    } else {
      usedChars += page.text.length;
    }
  }
  const totalChars = pages.reduce((sum, page) => sum + (page?.text.length ?? 0), 0);

  const ok = pages.filter((page) => page && !page.error).length;
  const failed = pages.length - ok;
  const truncated = pages.filter((page) => page?.truncated).length;
  const hints: string[] = [];
  if (failed > 0) {
    hints.push(`Partial results: ${failed} of ${pages.length} URLs failed (see pages[]).`);
  }
  if (pages.some((page) => page?.total_cap_reached)) {
    hints.push(
      `The total text cap (${maxTotalChars.toLocaleString()} chars) was reached; raise --max-total-chars for more.`,
    );
  }
  if (pages.some((page) => page?.error_code === "E_FETCH" && /private|loopback|local/i.test(page.error ?? ""))) {
    hints.push("Private-network fetches are blocked by default; set WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1 only when you trust the target.");
  }

  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    pages,
    stats: {
      requested: urls.length,
      ok,
      failed,
      total_chars: totalChars,
      truncated,
      duration_ms: performance.now() - started,
    },
    hints,
  };
}

async function fetchOne(
  rawUrl: string,
  options: {
    maxCharsPerPage: number;
    timeoutMs: number;
    allowPrivateHosts: boolean;
    userAgent: string;
    signal?: AbortSignal;
  },
): Promise<FetchPage> {
  const started = performance.now();
  const base = {
    url: rawUrl,
    text: "",
    bytes: 0,
    truncated: false,
    latency_ms: null as number | null,
  };

  try {
    let current = rawUrl;
    let redirected = false;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      let parsed: URL;
      try {
        parsed = new URL(current);
      } catch {
        throw new WideSearchError({
          code: "E_VALIDATION",
          message: "URL is not valid",
          got: current,
        });
      }

      const target = await resolveSafeTarget(parsed, options.allowPrivateHosts);
      const response = await requestWithFallback(target, options);

      if (response.redirect) {
        if (redirectCount === MAX_REDIRECTS) {
          throw new WideSearchError({
            code: "E_FETCH",
            message: "Too many redirects",
            got: rawUrl,
            hint: `The limit is ${MAX_REDIRECTS}.`,
          });
        }
        current = new URL(response.redirect, target.url).toString();
        redirected = true;
        continue;
      }

      const contentType = firstHeader(response.headers["content-type"]) ?? "";
      const baseType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
      const text = decodeBody(response.body, contentType);

      if (response.status < 200 || response.status >= 300) {
        return {
          ...base,
          final_url: redirected ? current : undefined,
          status: response.status,
          content_type: baseType || undefined,
          bytes: response.body.byteLength,
          latency_ms: performance.now() - started,
          error: `HTTP ${response.status}`,
          error_code: "E_FETCH",
        };
      }

      if (!isTextualContentType(baseType)) {
        return {
          ...base,
          final_url: redirected ? current : undefined,
          status: response.status,
          content_type: baseType || undefined,
          bytes: response.body.byteLength,
          latency_ms: performance.now() - started,
          error: `Unsupported content type: ${baseType || "unknown"}`,
          error_code: "E_FETCH",
        };
      }

      const title = baseType.includes("html") ? extractTitle(text) : undefined;
      const plain = baseType.includes("html") ? htmlToText(text) : text;
      const clipped = truncateRaw(plain, options.maxCharsPerPage);
      return {
        ...base,
        final_url: redirected ? current : undefined,
        status: response.status,
        title,
        text: clipped.value,
        content_type: baseType || undefined,
        bytes: response.body.byteLength,
        truncated: response.truncated || clipped.truncated,
        latency_ms: performance.now() - started,
      };
    }

    throw new WideSearchError({
      code: "E_FETCH",
      message: "Too many redirects",
      got: rawUrl,
    });
  } catch (error) {
    const wrapped = isWideSearchError(error)
      ? error
      : new WideSearchError({
          code: "E_FETCH",
          message: "Page fetch failed",
          got: error instanceof Error ? error.message : String(error),
          cause: error,
        });
    return {
      ...base,
      latency_ms: performance.now() - started,
      error: wrapped.got ? `${wrapped.message}: ${wrapped.got}` : wrapped.message,
      error_code: wrapped.code,
    };
  }
}

async function resolveSafeTarget(url: URL, allowPrivateHosts: boolean): Promise<SafeTarget> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WideSearchError({
      code: "E_FETCH",
      message: "Only http and https URLs can be fetched",
      got: url.toString(),
    });
  }
  if (url.username || url.password) {
    throw new WideSearchError({
      code: "E_FETCH",
      message: "URLs with embedded credentials are not allowed",
      got: url.toString(),
    });
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname) {
    throw new WideSearchError({ code: "E_FETCH", message: "URL has no host" , got: url.toString() });
  }

  if (!allowPrivateHosts && isBlockedHostname(hostname)) {
    throw new WideSearchError({
      code: "E_FETCH",
      message: "Refusing to fetch a local or private hostname",
      got: hostname,
      hint: "Set WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1 only if you trust the target.",
    });
  }

  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (!allowPrivateHosts && isPrivateAddress(hostname)) {
      throw new WideSearchError({
        code: "E_FETCH",
        message: "Refusing to fetch a private network address",
        got: hostname,
        hint: "Set WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1 only if you trust the target.",
      });
    }
    return { url, addresses: [{ address: hostname, family: literalFamily }] };
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new WideSearchError({
      code: "E_FETCH",
      message: `Could not resolve ${hostname}`,
      cause: error,
    });
  }
  if (addresses.length === 0) {
    throw new WideSearchError({ code: "E_FETCH", message: `No addresses for ${hostname}` });
  }
  if (!allowPrivateHosts) {
    const blocked = addresses.find((entry) => isPrivateAddress(entry.address));
    if (blocked) {
      throw new WideSearchError({
        code: "E_FETCH",
        message: "Refusing to fetch a hostname that resolves to a private network address",
        got: `${hostname} -> ${blocked.address}`,
        hint: "Set WIDE_SEARCH_ALLOW_PRIVATE_HOSTS=1 only if you trust the target.",
      });
    }
  }
  // Prefer IPv4 first: many sandboxes and hosts have working IPv4 but no
  // routable IPv6. The guard already checked every address before this point.
  const ordered = [...addresses].sort((a, b) => {
    if (a.family === b.family) return 0;
    return a.family === 4 ? -1 : 1;
  });
  return { url, addresses: ordered };
}

async function requestWithFallback(
  target: SafeTarget,
  options: {
    maxCharsPerPage: number;
    timeoutMs: number;
    userAgent: string;
    signal?: AbortSignal;
  },
): Promise<RawResponse> {
  let lastError: unknown;
  for (const address of target.addresses) {
    try {
      return await requestOnce(target.url, address, options);
    } catch (error) {
      lastError = error;
      // A connection failure on one address is worth retrying on the next
      // resolved address. Timeouts and protocol errors are not.
      if (!isWideSearchError(error) || error.code !== "E_FETCH") throw error;
      if (options.signal?.aborted) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new WideSearchError({ code: "E_FETCH", message: "Page fetch failed" });
}

async function requestOnce(
  url: URL,
  address: { address: string; family: number },
  options: {
    maxCharsPerPage: number;
    timeoutMs: number;
    userAgent: string;
    signal?: AbortSignal;
  },
): Promise<RawResponse> {
  const isHttps = url.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const maxBytes = Math.max(64 * 1024, Math.min(4 * 1024 * 1024, options.maxCharsPerPage * 6));

  const lookup: LookupFunction = ((_hostname, lookupOptions, callback) => {
    if (lookupOptions && (lookupOptions as { all?: boolean }).all) {
      (callback as unknown as (error: null, addresses: Array<{ address: string; family: number }>) => void)(
        null,
        [address],
      );
    } else {
      callback(null, address.address, address.family);
    }
  }) as LookupFunction;

  return new Promise<RawResponse>((resolve, reject) => {
    let settled = false;
    let removeAbortListener: (() => void) | undefined;
    const finish = (value: RawResponse) => {
      if (settled) return;
      settled = true;
      removeAbortListener?.();
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      removeAbortListener?.();
      reject(error);
    };

    const request = requestFn({
      protocol: url.protocol,
      hostname,
      port: url.port ? Number(url.port) : undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        "user-agent": options.userAgent,
        accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.1",
        "accept-encoding": "gzip, deflate, br",
        connection: "close",
      },
      ...(isHttps && isIP(hostname) === 0 ? { servername: hostname } : {}),
      lookup,
      timeout: options.timeoutMs,
    });

    const onAbort = () => request.destroy(new Error("aborted"));
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else {
        options.signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => options.signal?.removeEventListener("abort", onAbort);
      }
    }

    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => {
      if ((error as Error).message === "timeout") {
        fail(
          new WideSearchError({
            code: "E_TIMEOUT",
            message: "Page fetch timed out",
            got: url.toString(),
            hint: "Raise --timeout-ms or fetch fewer URLs.",
            cause: error,
          }),
        );
      } else if (options.signal?.aborted) {
        fail(new WideSearchError({ code: "E_TIMEOUT", message: "Page fetch was cancelled" }));
      } else {
        fail(
          new WideSearchError({
            code: "E_FETCH",
            message: "Page fetch failed",
            got: error instanceof Error ? error.message : String(error),
            cause: error,
          }),
        );
      }
    });

    request.on("response", (response) => {
      const status = response.statusCode ?? 0;
      const headers = response.headers;
      const location = firstHeader(headers.location);
      if (status >= 300 && status < 400 && location) {
        response.resume();
        finish({
          status,
          headers,
          body: Buffer.alloc(0),
          truncated: false,
          redirect: location,
        });
        return;
      }

      if (status < 200 || status >= 300) {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          if (bytes < 4_096) {
            chunks.push(chunk.subarray(0, Math.max(0, 4_096 - bytes)));
            bytes += chunk.length;
          }
        });
        response.on("end", () => {
          finish({
            status,
            headers,
            body: Buffer.concat(chunks),
            truncated: false,
          });
        });
        response.on("error", fail);
        return;
      }

      const encoding = (firstHeader(headers["content-encoding"]) ?? "").toLowerCase();
      let stream: NodeJS.ReadableStream = response;
      try {
        if (encoding.includes("gzip")) stream = response.pipe(createGunzip());
        else if (encoding.includes("deflate")) stream = response.pipe(createInflate());
        else if (encoding.includes("br")) stream = response.pipe(createBrotliDecompress());
      } catch (error) {
        response.resume();
        fail(
          new WideSearchError({
            code: "E_FETCH",
            message: "Could not decompress the response",
            cause: error,
          }),
        );
        return;
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      let truncated = false;

      stream.on("data", (chunk: Buffer) => {
        if (truncated) return;
        bytes += chunk.byteLength;
        if (bytes > maxBytes) {
          truncated = true;
          const overflow = bytes - maxBytes;
          const keep = chunk.subarray(0, Math.max(0, chunk.byteLength - overflow));
          if (keep.byteLength > 0) chunks.push(keep);
          if (typeof (stream as unknown as { destroy?: () => void }).destroy === "function") {
            (stream as unknown as { destroy: () => void }).destroy();
          }
          finish({
            status,
            headers,
            body: Buffer.concat(chunks),
            truncated: true,
          });
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => {
        finish({ status, headers, body: Buffer.concat(chunks), truncated });
      });
      stream.on("error", (error) => {
        fail(
          new WideSearchError({
            code: "E_FETCH",
            message: "Could not read the response body",
            cause: error,
          }),
        );
      });
    });

    request.end();
  });
}

function uniqueUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isTextualContentType(contentType: string): boolean {
  if (!contentType) return true;
  return (
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("xhtml") ||
    contentType.includes("markdown")
  );
}

function decodeBody(body: Buffer, contentType: string): string {
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().replace(/["']/g, "");
  try {
    return new TextDecoder(charset || "utf-8").decode(body);
  } catch {
    return body.toString("utf8");
  }
}

function truncateRaw(value: string, maxChars: number): { value: string; truncated: boolean } {
  if (value.length <= maxChars) return { value, truncated: false };
  return {
    value: `${value.slice(0, Math.max(0, maxChars - 32)).trimEnd()}\n\n[truncated]`,
    truncated: true,
  };
}

// ---------------------------------------------------------------------------
// HTML to text
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function htmlToText(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const withoutHead = withoutComments.replace(/<head\b[\s\S]*?<\/head>/gi, " ");
  const withoutBlocks = withoutHead.replace(
    /<(script|style|noscript|svg|template|iframe|object|embed|canvas)\b[\s\S]*?<\/\1>/gi,
    " ",
  );
  const withBreaks = withoutBlocks
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|li|tr|h[1-6]|blockquote|pre)>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(/<\s*hr\s*\/?>/gi, "\n---\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractTitle(html: string): string | undefined {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match?.[1]) return undefined;
  const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return title || undefined;
}

// ---------------------------------------------------------------------------
// SSRF address checks
// ---------------------------------------------------------------------------

export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  return (
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".home.arpa")
  );
}

export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  const family = isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b, c, d] = parts as [number, number, number, number];
  const value = (((a << 24) >>> 0) + ((b << 16) >>> 0) + ((c << 8) >>> 0) + d) >>> 0;
  const ranges: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return ranges.some(([base, bits]) => {
    const baseValue = ipv4ToInt(base);
    if (baseValue === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (baseValue & mask);
  });
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  const [a, b, c, d] = parts as [number, number, number, number];
  return (((a << 24) >>> 0) + ((b << 16) >>> 0) + ((c << 8) >>> 0) + d) >>> 0;
}

function isPrivateIpv6(ip: string): boolean {
  if (ip === "::" || ip === "::1") return true;
  if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 link-local
  if (/^fe[c-f]/.test(ip)) return true; // fec0::/10 deprecated site-local
  if (/^f[cd]/.test(ip)) return true; // fc00::/7 unique-local
  if (/^ff/.test(ip)) return true; // multicast
  if (ip.startsWith("2001:db8")) return true; // documentation
  if (ip.startsWith("2001:10") || ip.startsWith("2001:20")) return true; // ORCHID

  const mapped = extractMappedIpv4(ip);
  if (mapped) return isPrivateIpv4(mapped);
  return false;
}

function extractMappedIpv4(ip: string): string | null {
  const prefixes = ["::ffff:", "64:ff9b::"];
  const prefix = prefixes.find((candidate) => ip.startsWith(candidate));
  if (!prefix) return null;
  const tail = ip.slice(prefix.length);
  if (tail.includes(".")) return tail;
  const groups = tail.split(":").filter(Boolean);
  if (groups.length < 2) return null;
  const hi = Number.parseInt(groups[groups.length - 2] ?? "", 16);
  const lo = Number.parseInt(groups[groups.length - 1] ?? "", 16);
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}
