import { z } from 'zod';
import { INVITABLE_ROLES, INVITATION_STATUSES, LIMITS } from '../constants';
import { idSchema, isoDateTimeSchema, optionalText } from './common';
import { churchSummarySchema } from './church';

export const invitationSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  /**
   * The link token, present only in the answer that made or regenerated the link: the server
   * keeps a hash, so a list never shows it again.
   */
  token: z.string().nullable(),
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
  /** The join link (`/join/<token>`), shown once like `token`. */
  url: z.string().nullable(),
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
  token: z.string().trim().min(1).max(LIMITS.tokenMax),
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
