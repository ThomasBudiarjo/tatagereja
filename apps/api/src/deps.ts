import type { AppConfig } from './config';
import type { Db } from './db/client';
import type { ResultCache } from './lib/cache';
import type { Limiters } from './lib/rate-limit';
import type { TurnstileVerifier } from './lib/turnstile';

export type Deps = {
  db: Db;
  config: AppConfig;
  /** Named rate limiters; modules add their own with `enforceRateLimit` (lib/rate-limit.ts). */
  limiters: Limiters;
  verifyTurnstile: TurnstileVerifier | null;
  /** Expensive read results (reports, absence lists), dropped on every write to their church. */
  cache: ResultCache;
};
