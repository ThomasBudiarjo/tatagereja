import { defineNotificationTypes } from '../types';

/** Notification types of the records module. Add entries here; they appear in preferences automatically. */
export const RECORDS_NOTIFICATION_TYPES = defineNotificationTypes('records', [
  {
    type: 'record.added',
    label: { en: 'Church registry', id: 'Catatan gerejawi' },
    description: {
      en: 'When your baptism, sidi, marriage blessing or another church record is entered or corrected.',
      id: 'Saat catatan baptis, sidi, pemberkatan nikah, atau catatan gerejawi Anda lainnya dicatat atau dikoreksi.',
    },
  },
] as const);
