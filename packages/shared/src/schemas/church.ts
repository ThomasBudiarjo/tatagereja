import { z } from 'zod';
import { CHURCH_ROLES, LIMITS } from '../constants';
import {
  idSchema,
  isoDateTimeSchema,
  optionalEmail,
  optionalHexColor,
  optionalText,
  optionalUrl,
  requiredText,
} from './common';
import { userSummarySchema } from './auth';

export const churchRoleSchema = z.enum(CHURCH_ROLES);

export const churchSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  logoUrl: z.string().nullable(),
  brandColor: z.string().nullable(),
  ownerUserId: idSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Church = z.infer<typeof churchSchema>;

export const churchSummarySchema = churchSchema.pick({
  id: true,
  name: true,
  city: true,
  logoUrl: true,
  brandColor: true,
});
export type ChurchSummary = z.infer<typeof churchSummarySchema>;

export const churchInputSchema = z.object({
  name: requiredText(2, LIMITS.nameMax),
  description: optionalText(LIMITS.longTextMax),
  address: optionalText(LIMITS.shortTextMax),
  city: optionalText(LIMITS.shortTextMax),
  phone: optionalText(LIMITS.phoneMax),
  email: optionalEmail,
  website: optionalUrl,
  logoUrl: optionalUrl,
  brandColor: optionalHexColor,
});
export type ChurchInput = z.infer<typeof churchInputSchema>;

export const membershipSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  userId: idSchema,
  role: churchRoleSchema,
  joinedAt: isoDateTimeSchema,
  user: userSummarySchema,
});
export type Membership = z.infer<typeof membershipSchema>;

/** The caller's own access inside a church. Used by both the API and the UI to decide permissions. */
export const accessSchema = z.object({
  userId: idSchema,
  role: churchRoleSchema,
  leaderGroupIds: z.array(idSchema),
  personId: idSchema.nullable(),
});
export type Access = z.infer<typeof accessSchema>;

export const churchWithAccessSchema = z.object({
  church: churchSchema,
  membership: membershipSchema,
  access: accessSchema,
  memberCount: z.number().int().nonnegative(),
});
export type ChurchWithAccess = z.infer<typeof churchWithAccessSchema>;

export const myChurchesSchema = z.object({
  items: z.array(
    z.object({
      church: churchSchema,
      role: churchRoleSchema,
      memberCount: z.number().int().nonnegative(),
      joinedAt: isoDateTimeSchema,
    }),
  ),
});
export type MyChurches = z.infer<typeof myChurchesSchema>;

export const membershipListSchema = z.object({ items: z.array(membershipSchema) });
export type MembershipList = z.infer<typeof membershipListSchema>;

export const updateMembershipRoleBodySchema = z.object({
  role: z.enum(['administrator', 'member']),
});
export type UpdateMembershipRoleBody = z.infer<typeof updateMembershipRoleBodySchema>;

export const transferOwnershipBodySchema = z.object({
  userId: idSchema,
  password: z.string().min(1).max(LIMITS.passwordMax),
});
export type TransferOwnershipBody = z.infer<typeof transferOwnershipBodySchema>;

export const churchResponseSchema = z.object({ church: churchSchema });
