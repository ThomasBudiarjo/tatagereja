import type { AppConfig } from './config';
import type { Db } from './db/client';
import type { RateLimiter } from './lib/rate-limit';
import type { TurnstileVerifier } from './lib/turnstile';

export type Deps = {
  db: Db;
  config: AppConfig;
  limiters: {
    login: RateLimiter;
    register: RateLimiter;
    invitation: RateLimiter;
  };
  verifyTurnstile: TurnstileVerifier | null;
};
