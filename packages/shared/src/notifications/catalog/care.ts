import { defineNotificationTypes } from '../types';

/** Notification types of the care module. Add entries here; they appear in preferences automatically. */
export const CARE_NOTIFICATION_TYPES = defineNotificationTypes('care', [] as const);
