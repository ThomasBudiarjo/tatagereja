import type { Limiters, RateLimitOptions } from './rate-limit';
import { enforceRateLimit } from './rate-limit';

/*
 * Abuse limits that apply to every route by its kind, so a new route is covered without
 * remembering to add them: request body sizes per kind of route, and per-account rate limits
 * for writes, exports and searches. Route-specific limits (codes, tokens, sign-in) stay where
 * they are and are stricter.
 */

/** Largest request body per kind of route, in KB (never above `MAX_BODY_KB`). */
export const BODY_LIMIT_KB = {
  /** Sign-in, registration, passwords and codes. */
  auth: 32,
  /** Long documents: Warta Jemaat, liturgies, songs, registry entries, pastoral notes. */
  documents: 1024,
  /** Everything else, including bulk lists of ids or attendance marks. */
  standard: 256,
} as const;

const IMPORT_PATH = /\/import(\/|$)/;
const DOCUMENT_PATH =
  /^\/api\/churches\/[^/]+\/(bulletins|worship\/(services\/[^/]+\/liturgy|songs)|records\/entries|care\/)/;

/** The body limit of a request in bytes: imports may use the whole server limit. */
export function bodyLimitFor(pathname: string, serverMaxBytes: number): number {
  if (IMPORT_PATH.test(pathname)) return serverMaxBytes;
  const kb = pathname.startsWith('/api/auth/')
    ? BODY_LIMIT_KB.auth
    : DOCUMENT_PATH.test(pathname)
      ? BODY_LIMIT_KB.documents
      : BODY_LIMIT_KB.standard;
  return Math.min(kb * 1024, serverMaxBytes);
}

/** Per-account limits, generous for people and tight enough to stop a runaway script. */
export const ACCOUNT_LIMITS = {
  /** Every POST, PUT, PATCH and DELETE (a demo church is seeded with about 800). */
  writes: { windowMs: 10 * 60_000, max: 1200 },
  /** Downloads and reports: CSV exports, rosters, giving statements, backups, report pages. */
  exports: { windowMs: 15 * 60_000, max: 120 },
  /** Searches (`q`) and duplicate scans; the app debounces typing. */
  searches: { windowMs: 5 * 60_000, max: 900 },
} satisfies Record<string, RateLimitOptions>;

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXPORT_PATH =
  /\/(export|backup)$|\/groups\/[^/]+\/roster$|\/reports\/[^/]+$|\/giving-statements(\/|$)/;
const SEARCH_PATH = /\/duplicates$/;

/** The per-account limits a request counts towards. */
export function accountLimitsFor(method: string, url: URL): (keyof typeof ACCOUNT_LIMITS)[] {
  const kinds: (keyof typeof ACCOUNT_LIMITS)[] = [];
  if (WRITE_METHODS.has(method)) kinds.push('writes');
  if (EXPORT_PATH.test(url.pathname)) kinds.push('exports');
  if (method === 'GET' && (url.searchParams.get('q')?.trim() || SEARCH_PATH.test(url.pathname))) {
    kinds.push('searches');
  }
  return kinds;
}

/** Counts a signed-in request towards its account's limits; 429 when one is full. */
export function enforceAccountLimits(
  limiters: Limiters,
  userId: string,
  method: string,
  url: URL,
): void {
  for (const kind of accountLimitsFor(method, url)) {
    enforceRateLimit(limiters, `account.${kind}`, userId, ACCOUNT_LIMITS[kind]);
  }
}
