import { z } from 'zod';
import { INVITABLE_ROLES, INVITATION_STATUSES, LIMITS } from '../constants';
import { idSchema, isoDateTimeSchema, optionalText } from './common';
import { churchSummarySchema } from './church';

export const invitationSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  token: z.string(),
  role: z.enum(INVITABLE_ROLES),
  label: z.string().nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  maxUses: z.number().int().positive().nullable(),
  useCount: z.number().int().nonnegative(),
  revokedAt: isoDateTimeSchema.nullable(),
  status: z.enum(INVITATION_STATUSES),
  createdBy: idSchema,
  createdByName: z.string(),
  createdAt: isoDateTimeSchema,
  url: z.string(),
});
export type Invitation = z.infer<typeof invitationSchema>;

export const invitationListSchema = z.object({ items: z.array(invitationSchema) });

export const createInvitationBodySchema = z.object({
  role: z.enum(INVITABLE_ROLES).default('member'),
  label: optionalText(LIMITS.shortTextMax),
  expiresInDays: z.number().int().min(1).max(LIMITS.invitationMaxDays).nullable().default(7),
  maxUses: z.number().int().min(1).max(LIMITS.invitationMaxUsesMax).nullable().default(null),
});
export type CreateInvitationBody = z.infer<typeof createInvitationBodySchema>;

export const invitationTokenParamsSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

export const publicInvitationSchema = z.object({
  church: churchSummarySchema,
  role: z.enum(INVITABLE_ROLES),
  status: z.enum(INVITATION_STATUSES),
  expiresAt: isoDateTimeSchema.nullable(),
});
export type PublicInvitation = z.infer<typeof publicInvitationSchema>;

export const acceptInvitationResponseSchema = z.object({
  churchId: idSchema,
  alreadyMember: z.boolean(),
});
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;

export const invitationResponseSchema = z.object({ invitation: invitationSchema });
