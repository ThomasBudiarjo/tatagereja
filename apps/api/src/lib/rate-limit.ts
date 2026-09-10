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
