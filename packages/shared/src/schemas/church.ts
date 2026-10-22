import { z } from 'zod';
import { CHURCH_ROLES, LIMITS, MEMBERSHIP_STATUSES } from '../constants';
import { isModuleId, type ModuleId } from '../modules';
import { isPermission, type Permission } from '../permissions';
import {
  currencySchema,
  idSchema,
  isoDateTimeSchema,
  optionalEmail,
  optionalHexColor,
  optionalText,
  optionalUrl,
  requiredText,
  timezoneSchema,
} from './common';
import { userSummarySchema } from './auth';

export const churchRoleSchema = z.enum(CHURCH_ROLES);
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);

/**
 * Lists of permission keys and module ids coming from a server. Unknown values are dropped
 * rather than rejected, so an older app keeps working against a newer server.
 */
export const permissionListSchema = z
  .array(z.string())
  .transform((values): Permission[] => values.filter(isPermission));
export const moduleListSchema = z
  .array(z.string())
  .transform((values): ModuleId[] => values.filter(isModuleId));

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
  /** ISO 4217 code; money is stored in its minor units. */
  currency: z.string(),
  /** IANA time zone used for dates such as service days and finance periods. */
  timezone: z.string(),
  /** Optional modules that are switched on. Required modules are always on. */
  enabledModules: moduleListSchema,
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
  /** Left unchanged when omitted. */
  currency: currencySchema.optional(),
  /** Left unchanged when omitted. */
  timezone: timezoneSchema.optional(),
});
export type ChurchInput = z.infer<typeof churchInputSchema>;

export const membershipSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  userId: idSchema,
  role: churchRoleSchema,
  status: membershipStatusSchema,
  /** Assigned custom role ids. */
  roleIds: z.array(idSchema),
  joinedAt: isoDateTimeSchema,
  user: userSummarySchema,
});
export type Membership = z.infer<typeof membershipSchema>;

/**
 * The caller's own access inside a church. Used by both the API and the UI to decide
 * permissions: `permissions` are the effective permissions (base role ∪ custom roles).
 */
export const accessSchema = z.object({
  userId: idSchema,
  role: churchRoleSchema,
  leaderGroupIds: z.array(idSchema),
  personId: idSchema.nullable(),
  permissions: permissionListSchema,
  roleIds: z.array(idSchema),
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
      status: membershipStatusSchema,
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

export const updateMembershipStatusBodySchema = z.object({
  status: membershipStatusSchema,
});
export type UpdateMembershipStatusBody = z.infer<typeof updateMembershipStatusBodySchema>;

export const membershipResponseSchema = z.object({ membership: membershipSchema });

export const deleteChurchBodySchema = z.object({
  password: z.string().min(1).max(LIMITS.passwordMax),
});
export type DeleteChurchBody = z.infer<typeof deleteChurchBodySchema>;

export const transferOwnershipBodySchema = z.object({
  userId: idSchema,
  password: z.string().min(1).max(LIMITS.passwordMax),
});
export type TransferOwnershipBody = z.infer<typeof transferOwnershipBodySchema>;

export const churchResponseSchema = z.object({ church: churchSchema });
