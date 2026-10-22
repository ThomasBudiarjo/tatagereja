import { defineNotificationTypes } from '../types';

export const CORE_NOTIFICATION_TYPES = defineNotificationTypes('core', [
  {
    type: 'membership.role_changed',
    label: { en: 'My role changed', id: 'Peran saya berubah' },
    description: {
      en: 'When your base role in a church changes.',
      id: 'Saat peran dasar Anda di sebuah gereja berubah.',
    },
    mandatory: true,
  },
  {
    type: 'membership.roles_changed',
    label: { en: 'My custom roles changed', id: 'Peran khusus saya berubah' },
    description: {
      en: 'When a custom role is assigned to you or removed from you.',
      id: 'Saat peran khusus diberikan kepada Anda atau dicabut dari Anda.',
    },
    mandatory: true,
  },
  {
    type: 'membership.status_changed',
    label: {
      en: 'My access was suspended or restored',
      id: 'Akses saya ditangguhkan atau dipulihkan',
    },
    description: {
      en: 'When your access to a church is suspended or restored.',
      id: 'Saat akses Anda ke sebuah gereja ditangguhkan atau dipulihkan.',
    },
    mandatory: true,
  },
  {
    type: 'church.ownership_transferred',
    label: { en: 'Church ownership', id: 'Kepemilikan gereja' },
    description: {
      en: 'When ownership of a church is handed to you.',
      id: 'Saat kepemilikan sebuah gereja diserahkan kepada Anda.',
    },
    mandatory: true,
  },
  {
    type: 'invitation.accepted',
    label: { en: 'Invitation accepted', id: 'Undangan diterima' },
    description: {
      en: 'When someone joins through an invitation you created.',
      id: 'Saat seseorang bergabung melalui undangan yang Anda buat.',
    },
  },
] as const);
