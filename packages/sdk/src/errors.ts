/**
 * Enumerated error codes and their process exit codes. Keep this table in one
 * place: the CLI, the MCP server, and `agent-context` all read from it.
 */
export const ERROR_CODES = {
  E_DRY_RUN: 0,
  E_NETWORK: 1,
  E_TIMEOUT: 1,
  E_FETCH: 1,
  E_CACHE: 1,
  E_VALIDATION: 2,
  E_BUDGET: 2,
  E_CONFIG: 3,
  E_NOT_FOUND: 4,
  E_AUTH: 5,
  E_RATE_LIMIT: 6,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface WideSearchErrorOptions {
  code: ErrorCode;
  message: string;
  hint?: string;
  got?: string;
  validValues?: readonly string[];
  statusCode?: number;
  retryAfterSeconds?: number;
  cause?: unknown;
}

export class WideSearchError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;
  readonly got?: string;
  readonly validValues?: readonly string[];
  readonly statusCode?: number;
  readonly retryAfterSeconds?: number;

  constructor(options: WideSearchErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "WideSearchError";
    this.code = options.code;
    this.hint = options.hint;
    this.got = options.got;
    this.validValues = options.validValues;
    this.statusCode = options.statusCode;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get exitCode(): number {
    return ERROR_CODES[this.code];
  }
}

export function isWideSearchError(error: unknown): error is WideSearchError {
  return error instanceof WideSearchError;
}

/** Wrap an arbitrary thrown value without losing the original cause. */
export function asWideSearchError(
  error: unknown,
  fallback: { code: ErrorCode; message: string; hint?: string },
): WideSearchError {
  if (isWideSearchError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new WideSearchError({
    code: fallback.code,
    message: `${fallback.message}: ${message}`,
    hint: fallback.hint,
    cause: error,
  });
}
