/**
 * Canonicalize a result URL so the same page found by several vendors is one
 * row. We keep meaningful query parameters, sort them for stability, and drop
 * only well-known tracking parameters.
 */
const TRACKING_PARAMS = new Set([
  "_ga",
  "_gl",
  "aff",
  "affiliate",
  "campaign",
  "dclid",
  "fbclid",
  "gclid",
  "gclsrc",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "oly_anon_id",
  "oly_enc_id",
  "partner",
  "ref",
  "ref_src",
  "ref_url",
  "srsltid",
  "ttclid",
  "twclid",
  "vero_id",
  "yclid",
]);

const TRACKING_PREFIXES = ["utm_", "pk_", "mtm_", "hsa_"];

function isTrackingParameter(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    TRACKING_PARAMS.has(lower) ||
    TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix))
  );
}

export function canonicalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  const kept: Array<[string, string]> = [];
  for (const [name, value] of url.searchParams.entries()) {
    if (!isTrackingParameter(name)) kept.push([name, value]);
  }
  kept.sort(([aName, aValue], [bName, bValue]) => {
    const byName = aName.localeCompare(bName);
    return byName !== 0 ? byName : aValue.localeCompare(bValue);
  });

  url.search = "";
  for (const [name, value] of kept) url.searchParams.append(name, value);

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
