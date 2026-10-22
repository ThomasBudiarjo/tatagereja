import { defineNotificationTypes } from '../types';

/** Notification types of the comms module. Add entries here; they appear in preferences automatically. */
export const COMMS_NOTIFICATION_TYPES = defineNotificationTypes('comms', [] as const);
