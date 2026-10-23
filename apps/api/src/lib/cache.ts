/**
 * A small in-memory cache for expensive read-only results (reports, absence lists), keyed by
 * church and parameters. Entries live at most `ttlMs` and are dropped as soon as anything in
 * their church may have changed: every mutating request to `/api/churches/:churchId/...` bumps
 * that church's generation, and a mutating request elsewhere that can touch church data
 * (account deletion, joining, a new church) bumps every church. A request bumps at its start and
 * again at its end, so a read computed while a write is in flight is never kept.
 *
 * The TTL bounds what no request changes: the passing of time (today, upcoming, scheduled
 * posts). Values are shared between requests; callers must not mutate them. Single process
 * only, like the rate limiters.
 */
export type ResultCache = {
  /** The cached value for `key` in the church, computing and storing it on a miss. */
  remember: <T>(churchId: string, key: string, compute: () => T) => T;
  /** Whether a fresh value is cached (used to rate-limit only real computations). */
  has: (churchId: string, key: string) => boolean;
  invalidateChurch: (churchId: string) => void;
  invalidateAll: () => void;
  readonly size: number;
};

type Entry = { value: unknown; expiresAt: number; generation: string };

export function createResultCache(
  options: { ttlMs: number; maxEntries: number } = { ttlMs: 60_000, maxEntries: 500 },
): ResultCache {
  const entries = new Map<string, Entry>();
  const churchGenerations = new Map<string, number>();
  let globalGeneration = 0;

  const generationOf = (churchId: string) =>
    `${globalGeneration}:${churchGenerations.get(churchId) ?? 0}`;
  const entryKey = (churchId: string, key: string) => `${churchId}\u0000${key}`;

  const fresh = (churchId: string, key: string): Entry | undefined => {
    const id = entryKey(churchId, key);
    const entry = entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now() || entry.generation !== generationOf(churchId)) {
      entries.delete(id);
      return undefined;
    }
    return entry;
  };

  return {
    remember<T>(churchId: string, key: string, compute: () => T): T {
      const hit = fresh(churchId, key);
      if (hit) {
        // Map order doubles as recency for the size cap.
        const id = entryKey(churchId, key);
        entries.delete(id);
        entries.set(id, hit);
        return hit.value as T;
      }
      const generation = generationOf(churchId);
      const value = compute();
      // A write that started while computing makes the value suspect: return it, keep nothing.
      if (generation === generationOf(churchId)) {
        entries.set(entryKey(churchId, key), {
          value,
          expiresAt: Date.now() + options.ttlMs,
          generation,
        });
        while (entries.size > options.maxEntries) {
          const oldest = entries.keys().next().value;
          if (oldest === undefined) break;
          entries.delete(oldest);
        }
      }
      return value;
    },
    has: (churchId, key) => fresh(churchId, key) !== undefined,
    invalidateChurch(churchId) {
      churchGenerations.set(churchId, (churchGenerations.get(churchId) ?? 0) + 1);
    },
    invalidateAll() {
      globalGeneration += 1;
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CHURCH_PATH = /^\/api\/churches\/([^/]+)(?:\/|$)/;
/**
 * Mutating account routes that cannot change what a cached church result shows: sessions,
 * sign-in, two-step setup, notifications and personal exports.
 */
const ACCOUNT_ONLY =
  /^\/api\/(?:auth\/(?:login|logout|sessions|change-password|export|two-factor)|notifications)(?:\/|$)/;

/** The decoded path segment, or null when its escapes are malformed. */
const decodeSegment = (segment: string): string | null => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

/**
 * Invalidates what a request may change; call at the start and at the end of each request.
 * Never throws: it also runs after the response, where an error would stop the server.
 * Registration is not account-only: an invitation token makes the new account join a church.
 */
export function invalidateForRequest(cache: ResultCache, method: string, pathname: string): void {
  if (!MUTATING.has(method)) return;
  const church = CHURCH_PATH.exec(pathname);
  const churchId = church?.[1] ? decodeSegment(church[1]) : null;
  if (churchId) {
    cache.invalidateChurch(churchId);
    return;
  }
  if (church || !ACCOUNT_ONLY.test(pathname)) cache.invalidateAll();
}
