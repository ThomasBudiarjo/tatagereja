import { LIMITS, REGISTRATION_MODES, type RegistrationMode } from '@tatagereja/shared';
import { z } from 'zod';
import { parseEncryptionKey } from './lib/crypto';
import { DEFAULT_PASSWORD_HASHING, type PasswordHashing } from './lib/password';

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
    SESSION_IDLE_DAYS: z.coerce.number().int().min(1).max(365).default(7),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    ENCRYPTION_KEY: z.string().trim().default(''),
    ENCRYPTION_PREVIOUS_KEYS: z.string().trim().default(''),
    TWO_FACTOR_ENCRYPTION_KEY: z.string().trim().default(''),
    WEB_DIST_DIR: z.string().trim().default(''),
    APP_URL: z.string().trim().default('http://localhost:5173').pipe(z.url()),
    SERVER_NAME: z.string().trim().min(1).max(120).default('TataGereja'),
    LOG_REQUESTS: booleanString,
    MAX_BODY_KB: z.coerce.number().int().min(16).max(51200).default(LIMITS.bodyKbDefault),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
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
    for (const [name, value] of [
      ['ENCRYPTION_KEY', env.ENCRYPTION_KEY],
      ...env.ENCRYPTION_PREVIOUS_KEYS.split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => ['ENCRYPTION_PREVIOUS_KEYS', part] as const),
    ] as const) {
      if (!value) continue;
      try {
        parseEncryptionKey(value, name);
      } catch (error) {
        ctx.addIssue({ code: 'custom', message: (error as Error).message, path: [name] });
      }
    }
    if (env.SESSION_IDLE_DAYS > env.SESSION_TTL_DAYS) {
      ctx.addIssue({
        code: 'custom',
        message: 'SESSION_IDLE_DAYS cannot be longer than SESSION_TTL_DAYS',
        path: ['SESSION_IDLE_DAYS'],
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
  /** Absolute session lifetime: a session ends this many days after sign-in, used or not. */
  sessionTtlDays: number;
  /** Idle timeout: a session unused for this many days ends. */
  sessionIdleDays: number;
  /** Lifetime of bearer access tokens (cross-origin clients); refresh tokens renew them. */
  accessTokenTtlMinutes: number;
  /** Field encryption key (`ENCRYPTION_KEY`) and older keys still read (see lib/crypto.ts). */
  encryptionKey: string;
  previousEncryptionKeys: string[];
  /** Key of the earlier two-factor secret format, read once to migrate those secrets. */
  legacyTwoFactorKey: string;
  /** argon2id parameters for new password hashes; older hashes are upgraded at sign-in. */
  passwordHashing: PasswordHashing;
  webDistDir: string | null;
  appUrl: string;
  serverName: string;
  logRequests: boolean;
  /** Largest accepted request body, in bytes. Larger requests get 413 PAYLOAD_TOO_LARGE. */
  maxBodyBytes: number;
  /** Reverse proxies in front of the server whose `X-Forwarded-For` entries are trusted. */
  trustProxy: number;
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
    sessionIdleDays: value.SESSION_IDLE_DAYS,
    accessTokenTtlMinutes: value.ACCESS_TOKEN_TTL_MINUTES,
    encryptionKey: value.ENCRYPTION_KEY,
    previousEncryptionKeys: value.ENCRYPTION_PREVIOUS_KEYS.split(',')
      .map((part) => part.trim())
      .filter(Boolean),
    legacyTwoFactorKey: value.TWO_FACTOR_ENCRYPTION_KEY,
    passwordHashing: DEFAULT_PASSWORD_HASHING,
    webDistDir: value.WEB_DIST_DIR || null,
    appUrl: value.APP_URL.replace(/\/+$/, ''),
    serverName: value.SERVER_NAME,
    logRequests: value.LOG_REQUESTS,
    maxBodyBytes: value.MAX_BODY_KB * 1024,
    trustProxy: value.TRUST_PROXY,
  };
}

/**
 * Configuration used by tests: in-memory database, public registration, no Turnstile. Tests
 * act as one reverse proxy so they can set the client address with `X-Forwarded-For`.
 */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    registrationMode: 'public',
    turnstile: null,
    corsOrigins: true,
    sessionTtlDays: 30,
    sessionIdleDays: 7,
    accessTokenTtlMinutes: 15,
    encryptionKey: '',
    previousEncryptionKeys: [],
    legacyTwoFactorKey: '',
    // The OWASP minimum keeps the suites fast; production uses DEFAULT_PASSWORD_HASHING.
    passwordHashing: { memoryCost: 19456, timeCost: 2 },
    webDistDir: null,
    appUrl: 'http://localhost:5173',
    serverName: 'TataGereja Test',
    logRequests: false,
    maxBodyBytes: LIMITS.bodyKbDefault * 1024,
    trustProxy: 1,
    ...overrides,
  };
}
