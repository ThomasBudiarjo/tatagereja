import { defineNotificationTypes } from '../types';

/** Notification types of the admin-security module. Add entries here; they appear in preferences automatically. */
export const ADMIN_SECURITY_NOTIFICATION_TYPES = defineNotificationTypes(
  'admin-security',
  [] as const,
);
