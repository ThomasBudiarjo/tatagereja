import type { Deps } from '../deps';
import { enforceRateLimit, type RateLimitOptions } from '../lib/rate-limit';

/**
 * Report computations one person may start in five minutes. Answers from the cache are free,
 * so opening and re-opening report pages never hits it; only a flood of new date ranges does.
 */
export const REPORT_RATE_LIMIT: RateLimitOptions = { windowMs: 5 * 60_000, max: 300 };

/**
 * A report result from the church's result cache (lib/cache.ts), computed on a miss. Misses
 * count against the caller's `limiter` budget, so nobody can keep the server busy with
 * uncacheable report requests. `key` must name everything the result depends on.
 */
export function cachedReport<T>(
  deps: Pick<Deps, 'cache' | 'limiters'>,
  scope: { churchId: string; userId: string; limiter: string },
  key: string,
  compute: () => T,
): T {
  if (!deps.cache.has(scope.churchId, key)) {
    enforceRateLimit(
      deps.limiters,
      scope.limiter,
      `${scope.churchId}:${scope.userId}`,
      REPORT_RATE_LIMIT,
    );
  }
  return deps.cache.remember(scope.churchId, key, compute);
}
