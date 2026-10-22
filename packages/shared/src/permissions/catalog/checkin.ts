import { definePermissions } from '../types';

/** Kids check-in for Sekolah Minggu. Guardians check in their own children without a permission. */
export const CHECKIN_PERMISSIONS = definePermissions('checkin', [
  {
    key: 'checkin.operate',
    label: { en: 'Operate kids check-in', id: 'Layani check-in Sekolah Minggu' },
    description: {
      en: 'Check children in and out and see class rosters with their alerts.',
      id: 'Melakukan check-in dan check-out anak serta melihat daftar kelas beserta catatan pentingnya.',
    },
    sensitive: true,
    templates: ['kids_teacher'],
  },
  {
    key: 'checkin.manage',
    label: { en: 'Manage kids check-in', id: 'Kelola check-in Sekolah Minggu' },
    description: {
      en: 'Manage classes, teachers and sessions, and override a check-out with a reason.',
      id: 'Mengelola kelas, guru, dan sesi, serta melakukan check-out darurat dengan alasan.',
    },
    sensitive: true,
    templates: ['ministry_coordinator'],
  },
] as const);
