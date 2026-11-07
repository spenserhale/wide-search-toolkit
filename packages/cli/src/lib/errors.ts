import {
  ERROR_CODES,
  isWideSearchError,
  type ErrorCode,
  type FetchReport,
  type SearchReport,
} from "@wide-search-toolkit/sdk";

export interface FormattedError {
  text: string;
  exitCode: number;
}

export function formatError(error: unknown): FormattedError {
  if (isWideSearchError(error)) {
    const parts = [`error[${error.code}]: ${error.message}`];
    if (error.got !== undefined) parts.push(`  got: "${error.got}"`);
    if (error.validValues && error.validValues.length > 0) {
      parts.push(`  valid: ${error.validValues.join(", ")}`);
    }
    if (error.hint) parts.push(`  hint: ${error.hint}`);
    return { text: parts.join("\n"), exitCode: error.exitCode };
  }
  if (error instanceof Error) {
    return { text: `error: ${error.message}`, exitCode: 1 };
  }
  return { text: `error: ${String(error)}`, exitCode: 1 };
}

export function exitOnError(
  error: unknown,
  exitFn: (code: number) => never = process.exit,
): never {
  const { text, exitCode } = formatError(error);
  process.stderr.write(`${text}\n`);
  return exitFn(exitCode);
}

export async function runCommand<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    exitOnError(error);
  }
}

export function errorCodeToExitCode(code: string | undefined): number {
  if (!code) return 1;
  return ERROR_CODES[code as ErrorCode] ?? 1;
}

/**
 * Partial vendor failure is still a useful result and exits 0. A report where
 * every selected vendor failed exits with the first vendor's error code so CI
 * and shell automation can react.
 */
export function exitCodeForSearchReport(report: SearchReport): number {
  const selected = report.vendors.filter((vendor) => vendor.selected);
  if (selected.length === 0) return ERROR_CODES.E_CONFIG;
  if (!report.all_failed) return 0;
  const firstFailure = selected.find((vendor) => vendor.status !== "ok");
  return errorCodeToExitCode(firstFailure?.error_code);
}

export function exitCodeForFetchReport(report: FetchReport): number {
  if (report.pages.length === 0) return 0;
  if (report.pages.some((page) => !page.error)) return 0;
  return errorCodeToExitCode(report.pages[0]?.error_code);
}
