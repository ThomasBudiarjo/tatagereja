import { z } from 'zod';
import { LIMITS } from '../constants';
import { idSchema, isoDateTimeSchema, optionalUrl, requiredText } from './common';

export const emailSchema = z.string().trim().max(LIMITS.emailMax).toLowerCase().pipe(z.email());

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, `Password must be at least ${LIMITS.passwordMin} characters`)
  .max(LIMITS.passwordMax);

export const userSchema = z.object({
  id: idSchema,
  email: z.email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;

export const userSummarySchema = userSchema.pick({
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
});
export type UserSummary = z.infer<typeof userSummarySchema>;

/**
 * How a client holds its session. `cookie`: the web app served by the API's own origin; the
 * session lives in an httpOnly cookie JavaScript cannot read, and writes carry a CSRF token.
 * `bearer`: any other client (the app pointed at another server, scripts); a short-lived access
 * token kept in memory plus a rotating refresh token.
 */
export const SESSION_TRANSPORTS = ['cookie', 'bearer'] as const;
export type SessionTransport = (typeof SESSION_TRANSPORTS)[number];

/** Header that carries the CSRF token of a cookie session on every write. */
export const CSRF_HEADER = 'x-csrf-token';

const transportSchema = z.enum(SESSION_TRANSPORTS).default('bearer');

export const registerBodySchema = z.object({
  name: requiredText(LIMITS.nameMin, LIMITS.nameMax),
  email: emailSchema,
  password: passwordSchema,
  invitationToken: z.string().trim().min(1).max(LIMITS.tokenMax).optional(),
  turnstileToken: z.string().trim().min(1).max(LIMITS.turnstileTokenMax).optional(),
  transport: transportSchema,
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(LIMITS.passwordMax),
  transport: transportSchema,
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const authResponseSchema = z.object({
  user: userSchema,
  transport: z.enum(SESSION_TRANSPORTS),
  /** Bearer sessions: the access token, valid until `expiresAt`. Null for cookie sessions. */
  token: z.string().nullable(),
  /** Bearer: when the access token stops working. Cookie: when the session ends. */
  expiresAt: isoDateTimeSchema,
  /** Bearer sessions: exchanges for a new token pair once (`POST /auth/refresh`). */
  refreshToken: z.string().nullable(),
  /** Absolute end of the session, whatever is refreshed. */
  sessionExpiresAt: isoDateTimeSchema,
  /** Cookie sessions: send it in the `x-csrf-token` header of every write. */
  csrfToken: z.string().nullable(),
  joinedChurchId: idSchema.nullable(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** `GET /auth/session`: the current session, and the CSRF token of a cookie session. */
export const currentSessionSchema = z.object({
  user: userSchema,
  transport: z.enum(SESSION_TRANSPORTS),
  csrfToken: z.string().nullable(),
  sessionExpiresAt: isoDateTimeSchema,
});
export type CurrentSession = z.infer<typeof currentSessionSchema>;

export const refreshBodySchema = z.object({
  refreshToken: z.string().trim().min(1).max(LIMITS.tokenMax),
});
export type RefreshBody = z.infer<typeof refreshBodySchema>;

export const updateProfileBodySchema = z.object({
  name: requiredText(LIMITS.nameMin, LIMITS.nameMax),
  avatarUrl: optionalUrl,
});
export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(LIMITS.passwordMax),
  newPassword: passwordSchema,
});
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

export const sessionSchema = z.object({
  id: idSchema,
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  userAgent: z.string().nullable(),
  /** Address the session signed in from; older sessions have none. */
  ip: z.string().nullable().default(null),
  transport: z.enum(SESSION_TRANSPORTS).default('bearer'),
  /** When the session ends unless it is used again before. */
  idleExpiresAt: isoDateTimeSchema.nullable().default(null),
  current: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

export const sessionListSchema = z.object({ items: z.array(sessionSchema) });
