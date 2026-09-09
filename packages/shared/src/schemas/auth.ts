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

export const registerBodySchema = z.object({
  name: requiredText(LIMITS.nameMin, LIMITS.nameMax),
  email: emailSchema,
  password: passwordSchema,
  invitationToken: z.string().trim().min(1).max(200).optional(),
  turnstileToken: z.string().trim().min(1).max(4096).optional(),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(LIMITS.passwordMax),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const authResponseSchema = z.object({
  user: userSchema,
  token: z.string(),
  expiresAt: isoDateTimeSchema,
  joinedChurchId: idSchema.nullable(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

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
  current: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

export const sessionListSchema = z.object({ items: z.array(sessionSchema) });
