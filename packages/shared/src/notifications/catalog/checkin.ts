import { defineNotificationTypes } from '../types';

/** Notification types of the checkin module. Add entries here; they appear in preferences automatically. */
export const CHECKIN_NOTIFICATION_TYPES = defineNotificationTypes('checkin', [] as const);
