import { definePermissions } from '../types';

/** Pastoral care (pelayanan pastoral), perkunjungan, prayer requests and diakonia. */
export const CARE_PERMISSIONS = definePermissions('care', [
  {
    key: 'prayer.submit',
    label: { en: 'Submit prayer requests', id: 'Kirim pokok doa' },
    description: {
      en: 'Share prayer requests with the church or the care team.',
      id: 'Membagikan pokok doa kepada jemaat atau tim pastoral.',
    },
    memberDefault: true,
  },
  {
    key: 'prayer.moderate',
    label: { en: 'Moderate prayer requests', id: 'Moderasi pokok doa' },
    description: {
      en: 'Review prayer requests before they are shown to the church.',
      id: 'Meninjau pokok doa sebelum ditampilkan kepada jemaat.',
    },
    templates: ['pastor', 'elder'],
  },
  {
    key: 'care.view',
    label: { en: 'View pastoral care', id: 'Lihat pelayanan pastoral' },
    description: {
      en: 'See normal care cases, visits and follow-ups. Confidential cases stay hidden.',
      id: 'Melihat pendampingan, perkunjungan, dan tindak lanjut biasa. Kasus rahasia tetap tersembunyi.',
    },
    sensitive: true,
    templates: ['pastor', 'elder'],
  },
  {
    key: 'care.manage',
    label: { en: 'Manage pastoral care', id: 'Kelola pelayanan pastoral' },
    description: {
      en: 'Open and update care cases, log visits and assign follow-up tasks.',
      id: 'Membuka dan memperbarui pendampingan, mencatat perkunjungan, dan menugaskan tindak lanjut.',
    },
    sensitive: true,
    templates: ['pastor', 'elder'],
  },
  {
    key: 'care.confidential',
    label: { en: 'Access confidential care', id: 'Akses pendampingan rahasia' },
    description: {
      en: 'Read confidential care cases and notes. Administrators do not have this unless it is granted.',
      id: 'Membaca pendampingan dan catatan yang bersifat rahasia. Administrator tidak memilikinya kecuali diberikan.',
    },
    sensitive: true,
    adminExcluded: true,
    templates: ['pastor'],
  },
  {
    key: 'diakonia.view',
    label: { en: 'View diakonia aid', id: 'Lihat bantuan diakonia' },
    description: {
      en: 'See records of diakonia (financial and material) aid.',
      id: 'Melihat catatan bantuan diakonia.',
    },
    sensitive: true,
    templates: ['pastor', 'elder', 'treasurer'],
  },
  {
    key: 'diakonia.manage',
    label: { en: 'Manage diakonia aid', id: 'Kelola bantuan diakonia' },
    description: {
      en: 'Record and update diakonia aid.',
      id: 'Mencatat dan memperbarui bantuan diakonia.',
    },
    sensitive: true,
    templates: ['pastor'],
  },
] as const);
