import { canonicalizeUrl } from "./canonical.js";
import { truncateText, unique } from "./normalize.js";
import type { MergedResult, NormalizedResult, VendorId } from "./types.js";

/** Standard reciprocal-rank-fusion constant. */
export const RRF_K = 60;

export interface MergeOptions {
  limit: number;
  snippetChars: number;
}

export interface MergeOutput {
  results: MergedResult[];
  resultsBeforeDedupe: number;
  resultsAfterDedupe: number;
  invalidUrls: number;
  truncated: boolean;
}

interface GroupMember {
  result: NormalizedResult;
  canonicalUrl: string;
}

/**
 * Dedupe by canonical URL, fuse the per-vendor ranks with reciprocal rank
 * fusion, and break ties deterministically. A vendor contributes at most once
 * per canonical URL (its best rank), so a vendor cannot stuff the ranking by
 * returning the same page under several URLs.
 */
export function mergeResults(
  normalized: readonly NormalizedResult[],
  options: MergeOptions,
): MergeOutput {
  const groups = new Map<string, GroupMember[]>();
  let invalidUrls = 0;

  for (const result of normalized) {
    const canonicalUrl = canonicalizeUrl(result.url);
    if (!canonicalUrl) {
      invalidUrls += 1;
      continue;
    }
    const members = groups.get(canonicalUrl);
    if (members) members.push({ result, canonicalUrl });
    else groups.set(canonicalUrl, [{ result, canonicalUrl }]);
  }

  const fused: Array<Omit<MergedResult, "rank">> = [];

  for (const [canonicalUrl, members] of groups.entries()) {
    const vendors = unique(members.map((member) => member.result.vendor)).sort() as VendorId[];
    const bestMember = members.reduce((best, member) =>
      member.result.rank < best.result.rank ? member : best,
    );

    let score = 0;
    for (const vendor of vendors) {
      let bestRank = Number.POSITIVE_INFINITY;
      for (const member of members) {
        if (member.result.vendor === vendor && member.result.rank < bestRank) {
          bestRank = member.result.rank;
        }
      }
      if (Number.isFinite(bestRank)) score += 1 / (RRF_K + bestRank);
    }

    const bestRank = Math.min(...members.map((member) => member.result.rank));
    const date = members.find((member) => member.result.date)?.result.date;

    fused.push({
      title: bestMember.result.title.trim() || canonicalUrl,
      url: canonicalUrl,
      snippet: truncateText(bestMember.result.snippet, options.snippetChars),
      ...(date ? { date } : {}),
      vendors,
      found_by: vendors.length,
      best_rank: bestRank,
      score,
    });
  }

  fused.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.found_by !== a.found_by) return b.found_by - a.found_by;
    if (a.best_rank !== b.best_rank) return a.best_rank - b.best_rank;
    return a.url.localeCompare(b.url);
  });

  const limited = fused.slice(0, options.limit).map((result, index) => ({
    ...result,
    rank: index + 1,
  }));

  return {
    results: limited,
    resultsBeforeDedupe: normalized.length,
    resultsAfterDedupe: fused.length,
    invalidUrls,
    truncated: fused.length > options.limit,
  };
}
