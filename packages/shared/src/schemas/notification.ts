import { z } from 'zod';
import { LIMITS } from '../constants';
import { NOTIFICATION_TYPES, type NotificationType } from '../notifications';
import {
  cursorQuerySchema,
  idSchema,
  isoDateTimeSchema,
  keysetPageSchema,
  paginatedSchema,
} from './common';

export const notificationSchema = z.object({
  id: idSchema,
  churchId: idSchema.nullable(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  /** In-app path to open, e.g. `/c/<churchId>/events/<id>`. */
  link: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  readAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = z.object({
  churchId: idSchema.optional(),
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(LIMITS.pageSizeDefault),
  ...cursorQuerySchema.shape,
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationListSchema = paginatedSchema(notificationSchema).extend({
  unreadCount: z.number().int().nonnegative(),
  ...keysetPageSchema.shape,
});
export type NotificationList = z.infer<typeof notificationListSchema>;

export const unreadCountQuerySchema = z.object({ churchId: idSchema.optional() });
export const unreadCountSchema = z.object({ count: z.number().int().nonnegative() });
export type UnreadCount = z.infer<typeof unreadCountSchema>;

export const markNotificationBodySchema = z.object({ read: z.boolean() });
export type MarkNotificationBody = z.infer<typeof markNotificationBodySchema>;

/** Marks every notification (optionally of one church) as read. */
export const markAllNotificationsBodySchema = z.object({
  read: z.literal(true),
  churchId: idSchema.optional(),
});
export type MarkAllNotificationsBody = z.infer<typeof markAllNotificationsBodySchema>;

export const notificationResponseSchema = z.object({ notification: notificationSchema });

const notificationTypeSchema = z.enum(
  NOTIFICATION_TYPES as [NotificationType, ...NotificationType[]],
);

export const notificationPreferenceSchema = z.object({
  type: z.string(),
  inApp: z.boolean(),
  email: z.boolean(),
  /** Mandatory types are always delivered in the app. */
  mandatory: z.boolean(),
});
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;

export const notificationPreferenceListSchema = z.object({
  items: z.array(notificationPreferenceSchema),
});
export type NotificationPreferenceList = z.infer<typeof notificationPreferenceListSchema>;

export const updateNotificationPreferencesBodySchema = z.object({
  items: z
    .array(z.object({ type: notificationTypeSchema, inApp: z.boolean(), email: z.boolean() }))
    .min(1)
    .max(Math.max(1, NOTIFICATION_TYPES.length)),
});
export type UpdateNotificationPreferencesBody = z.infer<
  typeof updateNotificationPreferencesBodySchema
>;

/** Notification title/body limits for services that create notifications. */
export const NOTIFICATION_LIMITS = {
  title: LIMITS.notificationTitleMax,
  body: LIMITS.notificationBodyMax,
} as const;
