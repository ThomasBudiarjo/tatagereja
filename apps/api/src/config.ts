import { REGISTRATION_MODES, type RegistrationMode } from '@tatagereja/shared';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const envSchema = z
  .object({
    HOST: z.string().trim().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_PATH: z.string().trim().min(1).default('./data/tatagereja.db'),
    REGISTRATION_MODE: z.enum(REGISTRATION_MODES).default('public'),
    TURNSTILE_ENABLED: booleanString,
    TURNSTILE_SITE_KEY: z.string().trim().default(''),
    TURNSTILE_SECRET_KEY: z.string().trim().default(''),
    CORS_ORIGINS: z.string().trim().default(''),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    WEB_DIST_DIR: z.string().trim().default(''),
    APP_URL: z.string().trim().default('http://localhost:5173').pipe(z.url()),
    SERVER_NAME: z.string().trim().min(1).max(120).default('TataGereja'),
    LOG_REQUESTS: booleanString,
  })
  .superRefine((env, ctx) => {
    if (env.TURNSTILE_ENABLED && (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are required when TURNSTILE_ENABLED=true',
        path: ['TURNSTILE_ENABLED'],
      });
    }
  });

export type TurnstileConfig = {
  siteKey: string;
  secretKey: string;
};

export type AppConfig = {
  host: string;
  port: number;
  databasePath: string;
  registrationMode: RegistrationMode;
  turnstile: TurnstileConfig | null;
  /** `true` allows any origin; otherwise an explicit allow list. */
  corsOrigins: true | string[];
  sessionTtlDays: number;
  webDistDir: string | null;
  appUrl: string;
  serverName: string;
  logRequests: boolean;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const value = parsed.data;
  const origins = value.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    host: value.HOST,
    port: value.PORT,
    databasePath: value.DATABASE_PATH,
    registrationMode: value.REGISTRATION_MODE,
    turnstile: value.TURNSTILE_ENABLED
      ? { siteKey: value.TURNSTILE_SITE_KEY, secretKey: value.TURNSTILE_SECRET_KEY }
      : null,
    corsOrigins: origins.length === 0 ? true : origins,
    sessionTtlDays: value.SESSION_TTL_DAYS,
    webDistDir: value.WEB_DIST_DIR || null,
    appUrl: value.APP_URL.replace(/\/+$/, ''),
    serverName: value.SERVER_NAME,
    logRequests: value.LOG_REQUESTS,
  };
}

/** Configuration used by tests: in-memory database, public registration, no Turnstile. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    registrationMode: 'public',
    turnstile: null,
    corsOrigins: true,
    sessionTtlDays: 30,
    webDistDir: null,
    appUrl: 'http://localhost:5173',
    serverName: 'TataGereja Test',
    logRequests: false,
    ...overrides,
  };
}
