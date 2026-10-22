import { rateLimited } from './errors';

export type RateLimiter = {
  /** Returns the number of seconds to wait, or 0 when the request is allowed. */
  check: (key: string) => number;
  reset: (key?: string) => void;
};

/** Simple in-memory sliding window rate limiter. Sufficient for a single-process server. */
export function createRateLimiter(options: { windowMs: number; max: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = Date.now();

  const sweep = (now: number) => {
    if (now - lastSweep < options.windowMs) return;
    lastSweep = now;
    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter((ts) => now - ts < options.windowMs);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  };

  return {
    check(key) {
      const now = Date.now();
      sweep(now);
      const fresh = (hits.get(key) ?? []).filter((ts) => now - ts < options.windowMs);
      if (fresh.length >= options.max) {
        const oldest = fresh[0] ?? now;
        hits.set(key, fresh);
        return Math.ceil((options.windowMs - (now - oldest)) / 1000);
      }
      fresh.push(now);
      hits.set(key, fresh);
      return 0;
    },
    reset(key) {
      if (key === undefined) hits.clear();
      else hits.delete(key);
    },
  };
}

export type RateLimitOptions = { windowMs: number; max: number };

/**
 * Named limiters shared by the whole server. The three built-in ones are always present;
 * modules add their own lazily through `enforceRateLimit`, and tests can pre-register a
 * permissive or strict limiter under the same name.
 */
export type Limiters = {
  login: RateLimiter;
  register: RateLimiter;
  invitation: RateLimiter;
  [name: string]: RateLimiter | undefined;
};

/** Returns the named limiter, creating it with `options` the first time it is used. */
export function limiterFor(
  limiters: Limiters,
  name: string,
  options: RateLimitOptions,
): RateLimiter {
  const existing = limiters[name];
  if (existing) return existing;
  const created = createRateLimiter(options);
  limiters[name] = created;
  return created;
}

/**
 * Counts one attempt for `key` and throws 429 RATE_LIMITED when the window is full.
 * Example: `enforceRateLimit(deps.limiters, 'checkin.checkout', `${church.id}:${ip}`, { windowMs: 15 * 60_000, max: 10 })`.
 */
export function enforceRateLimit(
  limiters: Limiters,
  name: string,
  key: string,
  options: RateLimitOptions,
): void {
  const wait = limiterFor(limiters, name, options).check(key);
  if (wait > 0) throw rateLimited(wait);
}
