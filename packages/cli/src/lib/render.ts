import type {
  FetchReport,
  SearchReport,
  VendorStatus,
} from "@wide-search-toolkit/sdk";

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function renderSearchText(report: SearchReport): string {
  const lines: string[] = [];
  lines.push(`query: ${report.query}`);
  lines.push(
    `mode: ${report.mode}${report.freshness ? `  freshness: ${report.freshness}` : ""}  limit: ${report.limit}`,
  );
  lines.push(
    `cache: ${report.cache.hit ? `hit (${Math.round((report.cache.age_ms ?? 0) / 1000)}s old)` : report.cache.stored ? "stored" : report.cache.enabled ? "miss" : "off"}`,
  );
  lines.push(
    `vendors: ${report.stats.vendors_ok}/${report.stats.vendors_selected} ok  cost: ~$${report.stats.estimated_cost_usd.toFixed(4)}  duration: ${Math.round(report.stats.duration_ms)}ms`,
  );
  lines.push("");
  lines.push("results:");
  if (report.results.length === 0) {
    lines.push("  (none)");
  }
  for (const result of report.results) {
    lines.push(`  ${result.rank}. ${result.title}`);
    lines.push(`     ${result.url}`);
    if (result.snippet) lines.push(`     ${result.snippet}`);
    const date = result.date ? `  date: ${result.date}` : "";
    lines.push(
      `     found by ${result.found_by}: ${result.vendors.join(", ")}${date}  score: ${result.score.toFixed(5)}`,
    );
  }
  const vendorLines = report.vendors
    .filter((vendor) => vendor.selected || vendor.status === "skipped_budget")
    .map(
      (vendor) =>
        `  ${vendor.vendor}: ${vendor.status}${vendor.selected ? `  ${vendor.results} results  ${vendor.latency_ms === null ? "cached" : `${Math.round(vendor.latency_ms)}ms`}` : ""}${vendor.reason ? `  (${vendor.reason})` : ""}`,
    );
  if (vendorLines.length > 0) {
    lines.push("");
    lines.push("vendor report:");
    lines.push(...vendorLines);
  }
  if (report.hints.length > 0) {
    lines.push("");
    lines.push("hints:");
    for (const hint of report.hints) lines.push(`  - ${hint}`);
  }
  return lines.join("\n");
}

export function renderSearchCsv(report: SearchReport): string {
  const header = "rank,title,url,snippet,date,vendors,found_by,score";
  const rows = report.results.map((result) =>
    [
      result.rank,
      result.title,
      result.url,
      result.snippet,
      result.date,
      result.vendors.join("|"),
      result.found_by,
      result.score,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export function renderFetchText(report: FetchReport): string {
  const lines: string[] = [];
  lines.push(
    `pages: ${report.stats.ok}/${report.stats.requested} ok  chars: ${report.stats.total_chars}  duration: ${Math.round(report.stats.duration_ms)}ms`,
  );
  for (const page of report.pages) {
    lines.push("");
    lines.push(`--- ${page.title ?? page.url}`);
    lines.push(`url: ${page.url}`);
    if (page.final_url && page.final_url !== page.url) lines.push(`final: ${page.final_url}`);
    if (page.error) {
      lines.push(`status: ${page.status ?? "error"}  error: ${page.error}`);
      continue;
    }
    lines.push(
      `status: ${page.status}  type: ${page.content_type ?? "unknown"}  bytes: ${page.bytes}${page.truncated ? "  truncated" : ""}`,
    );
    if (page.text) {
      const preview = page.text.length > 2_000 ? `${page.text.slice(0, 2_000)}…` : page.text;
      lines.push("");
      lines.push(preview);
    }
  }
  if (report.hints.length > 0) {
    lines.push("");
    lines.push("hints:");
    for (const hint of report.hints) lines.push(`  - ${hint}`);
  }
  return lines.join("\n");
}

export function renderFetchCsv(report: FetchReport): string {
  const header = "url,final_url,status,title,content_type,bytes,truncated,error";
  const rows = report.pages.map((page) =>
    [
      page.url,
      page.final_url,
      page.status,
      page.title,
      page.content_type,
      page.bytes,
      page.truncated,
      page.error,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export function renderVendorsText(vendors: VendorStatus[]): string {
  const lines: string[] = [];
  lines.push("vendor       configured  default  fresh  max  fast $  standard $");
  for (const vendor of vendors) {
    lines.push(
      `${vendor.id.padEnd(12)} ${String(vendor.configured).padEnd(10)} ${String(vendor.selected_by_default).padEnd(8)} ${String(vendor.supportsFreshness).padEnd(6)} ${String(vendor.maxResults).padEnd(4)} ${vendor.costUsd.fast.toFixed(4).padEnd(7)} ${vendor.costUsd.standard.toFixed(4)}`,
    );
  }
  return lines.join("\n");
}
