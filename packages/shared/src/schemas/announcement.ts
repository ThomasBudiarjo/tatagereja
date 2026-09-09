import { z } from 'zod';
import { ANNOUNCEMENT_STATUSES, LIMITS } from '../constants';
import {
  idSchema,
  isoDateTimeSchema,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
} from './common';

export const announcementSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  groupId: idSchema.nullable(),
  groupName: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  status: z.enum(ANNOUNCEMENT_STATUSES),
  publishedAt: isoDateTimeSchema.nullable(),
  createdBy: idSchema,
  authorName: z.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Announcement = z.infer<typeof announcementSchema>;

export const announcementInputSchema = z.object({
  title: requiredText(2, LIMITS.nameMax),
  body: requiredText(1, LIMITS.longTextMax),
  groupId: idSchema.nullable().default(null),
  status: z.enum(ANNOUNCEMENT_STATUSES).default('draft'),
});
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export const announcementListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ANNOUNCEMENT_STATUSES).optional(),
  groupId: idSchema.optional(),
});
export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>;

export const announcementListSchema = paginatedSchema(announcementSchema);
export type AnnouncementList = z.infer<typeof announcementListSchema>;

export const announcementDetailSchema = z.object({
  announcement: announcementSchema,
  canManage: z.boolean(),
});
export type AnnouncementDetail = z.infer<typeof announcementDetailSchema>;

export const announcementResponseSchema = z.object({ announcement: announcementSchema });
