import { defineNotificationTypes } from '../types';

/** Notification types of the insights module. Add entries here; they appear in preferences automatically. */
export const INSIGHTS_NOTIFICATION_TYPES = defineNotificationTypes('insights', [
  {
    type: 'attendance.absence_follow_up',
    label: { en: 'Absence follow-ups', id: 'Tindak lanjut ketidakhadiran' },
    description: {
      en: 'When you are asked to reach out to someone who has missed several services.',
      id: 'Saat Anda diminta menghubungi jemaat yang beberapa kali tidak hadir ibadah.',
    },
  },
] as const);
