import { defineNotificationTypes } from '../types';

/** Notification types of the checkin module. Add entries here; they appear in preferences automatically. */
export const CHECKIN_NOTIFICATION_TYPES = defineNotificationTypes('checkin', [
  {
    type: 'checkin.child_checked_in',
    label: { en: 'Child checked in', id: 'Anak masuk kelas' },
    description: {
      en: 'When someone else checks your child in to Sunday school.',
      id: 'Saat orang lain melakukan check-in anak Anda ke Sekolah Minggu.',
    },
  },
  {
    type: 'checkin.child_picked_up',
    label: { en: 'Child picked up', id: 'Anak dijemput' },
    description: {
      en: 'When your child is checked out of Sunday school, and by whom.',
      id: 'Saat anak Anda di-check-out dari Sekolah Minggu, beserta siapa yang menjemput.',
    },
  },
  {
    type: 'checkin.teacher_assigned',
    label: { en: 'Sunday school teaching', id: 'Tugas Guru Sekolah Minggu' },
    description: {
      en: 'When you are assigned to teach a Sunday school class.',
      id: 'Saat Anda ditugaskan mengajar sebuah kelas Sekolah Minggu.',
    },
  },
] as const);
