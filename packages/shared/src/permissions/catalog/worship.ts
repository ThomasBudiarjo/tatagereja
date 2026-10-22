import { definePermissions } from '../types';

/** Worship services (ibadah), liturgy, songs and volunteer rosters (jadwal pelayanan). */
export const WORSHIP_PERMISSIONS = definePermissions('worship', [
  {
    key: 'services.view',
    label: { en: 'View worship services', id: 'Lihat jadwal ibadah' },
    description: {
      en: 'See upcoming services, liturgy and rosters.',
      id: 'Melihat jadwal ibadah, liturgi, dan jadwal pelayanan.',
    },
    memberDefault: true,
  },
  {
    key: 'services.manage',
    label: { en: 'Manage worship services', id: 'Kelola ibadah & liturgi' },
    description: {
      en: 'Plan services, the liturgy order, the song library and serving teams.',
      id: 'Merencanakan ibadah, susunan liturgi, daftar lagu, dan tim pelayanan.',
    },
    templates: ['pastor', 'ministry_coordinator'],
  },
  {
    key: 'volunteers.schedule',
    label: { en: 'Schedule volunteers', id: 'Atur jadwal pelayanan' },
    description: {
      en: 'Assign people to serving positions and manage the rosters.',
      id: 'Menugaskan pelayan pada posisi pelayanan dan mengelola jadwalnya.',
    },
    templates: ['pastor', 'ministry_coordinator'],
  },
] as const);
