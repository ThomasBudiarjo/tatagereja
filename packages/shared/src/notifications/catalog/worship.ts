import { defineNotificationTypes } from '../types';

/** Notification types of the worship module. Add entries here; they appear in preferences automatically. */
export const WORSHIP_NOTIFICATION_TYPES = defineNotificationTypes('worship', [
  {
    type: 'roster.assigned',
    label: { en: 'Serving assignments', id: 'Jadwal pelayanan' },
    description: {
      en: 'When you are scheduled to serve at a service.',
      id: 'Saat Anda dijadwalkan melayani dalam ibadah.',
    },
  },
  {
    type: 'roster.changed',
    label: { en: 'Schedule changes', id: 'Perubahan jadwal' },
    description: {
      en: 'When an assignment of yours is removed or its service is cancelled.',
      id: 'Saat jadwal pelayanan Anda dihapus atau ibadahnya dibatalkan.',
    },
  },
  {
    type: 'roster.response',
    label: { en: 'Volunteer replies', id: 'Konfirmasi pelayan' },
    description: {
      en: 'When someone you scheduled accepts or declines.',
      id: 'Saat pelayan yang Anda jadwalkan bersedia atau berhalangan.',
    },
  },
] as const);
