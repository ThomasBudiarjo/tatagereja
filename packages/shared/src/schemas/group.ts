import { z } from 'zod';
import { GROUP_TYPES, LIMITS } from '../constants';
import { idSchema, isoDateSchema, isoDateTimeSchema, optionalText, requiredText } from './common';
import { personSummarySchema } from './person';

export const groupLeaderSchema = z.object({
  userId: idSchema,
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
});
export type GroupLeader = z.infer<typeof groupLeaderSchema>;

export const groupSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(GROUP_TYPES),
  meetingSchedule: z.string().nullable(),
  isActive: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  leaders: z.array(groupLeaderSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Group = z.infer<typeof groupSchema>;

export const groupSummarySchema = groupSchema.pick({ id: true, name: true, type: true });
export type GroupSummary = z.infer<typeof groupSummarySchema>;

export const groupInputSchema = z.object({
  name: requiredText(2, LIMITS.nameMax),
  description: optionalText(LIMITS.longTextMax),
  type: z.enum(GROUP_TYPES).default('ministry'),
  meetingSchedule: optionalText(LIMITS.shortTextMax),
  isActive: z.boolean().default(true),
});
export type GroupInput = z.infer<typeof groupInputSchema>;

export const groupMemberSchema = personSummarySchema.extend({
  joinedAt: isoDateSchema.nullable(),
  addedAt: isoDateTimeSchema,
});
export type GroupMember = z.infer<typeof groupMemberSchema>;

export const groupDetailSchema = z.object({
  group: groupSchema,
  members: z.array(groupMemberSchema),
  canManage: z.boolean(),
  canDelete: z.boolean(),
  canAssignLeaders: z.boolean(),
});
export type GroupDetail = z.infer<typeof groupDetailSchema>;

export const groupListSchema = z.object({ items: z.array(groupSchema) });
export type GroupList = z.infer<typeof groupListSchema>;

export const groupListQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const addGroupMembersBodySchema = z.object({
  personIds: z.array(idSchema).min(1).max(500),
});
export type AddGroupMembersBody = z.infer<typeof addGroupMembersBodySchema>;

export const groupLeaderBodySchema = z.object({
  userId: idSchema,
});
export type GroupLeaderBody = z.infer<typeof groupLeaderBodySchema>;

export const groupResponseSchema = z.object({ group: groupSchema });
