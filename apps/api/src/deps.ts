import type { AppConfig } from './config';
import type { Db } from './db/client';
import type { Limiters } from './lib/rate-limit';
import type { TurnstileVerifier } from './lib/turnstile';
import type { SecurityStartup } from './services/security-startup';

export type Deps = {
  db: Db;
  config: AppConfig;
  /** Named rate limiters; modules add their own with `enforceRateLimit` (lib/rate-limit.ts). */
  limiters: Limiters;
  verifyTurnstile: TurnstileVerifier | null;
  /** The encryption keyring and what the startup migration rewrote. */
  security: SecurityStartup;
};
