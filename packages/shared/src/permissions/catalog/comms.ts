import { definePermissions } from '../types';

/** Announcements, events, calendar, notifications and Warta Jemaat. */
export const COMMS_PERMISSIONS = definePermissions('comms', [
  {
    key: 'announcements.view',
    label: { en: 'View announcements', id: 'Lihat pengumuman' },
    description: {
      en: 'Read published announcements.',
      id: 'Membaca pengumuman yang telah diterbitkan.',
    },
    memberDefault: true,
  },
  {
    key: 'announcements.manage',
    label: { en: 'Manage announcements', id: 'Kelola pengumuman' },
    description: {
      en: 'Write, publish and delete any announcement. Group leaders manage their own groups without this.',
      id: 'Menulis, menerbitkan, dan menghapus pengumuman apa pun. Ketua kelompok tetap dapat mengelola pengumuman kelompoknya.',
    },
    templates: ['pastor', 'secretary'],
  },
  {
    key: 'events.view',
    label: { en: 'View events', id: 'Lihat kegiatan' },
    description: {
      en: 'See church and group events and respond to them.',
      id: 'Melihat kegiatan gereja dan kelompok serta memberi tanggapan kehadiran.',
    },
    memberDefault: true,
  },
  {
    key: 'events.manage',
    label: { en: 'Manage events', id: 'Kelola kegiatan' },
    description: {
      en: 'Create and edit any event. Group leaders manage their own groups without this.',
      id: 'Membuat dan mengubah kegiatan apa pun. Ketua kelompok tetap dapat mengelola kegiatan kelompoknya.',
    },
    templates: ['pastor', 'secretary', 'ministry_coordinator'],
  },
  {
    key: 'notifications.broadcast',
    label: { en: 'Send broadcast notifications', id: 'Kirim pemberitahuan massal' },
    description: {
      en: 'Notify the whole church, a group or a role at once.',
      id: 'Mengirim pemberitahuan ke seluruh jemaat, satu kelompok, atau satu peran sekaligus.',
    },
    templates: ['pastor', 'secretary'],
  },
  {
    key: 'bulletin.view',
    label: { en: 'Read Warta Jemaat', id: 'Baca Warta Jemaat' },
    description: {
      en: 'Read published weekly bulletins.',
      id: 'Membaca Warta Jemaat yang telah diterbitkan.',
    },
    memberDefault: true,
  },
  {
    key: 'bulletin.manage',
    label: { en: 'Manage Warta Jemaat', id: 'Kelola Warta Jemaat' },
    description: {
      en: 'Compose, publish and share the weekly bulletin.',
      id: 'Menyusun, menerbitkan, dan membagikan Warta Jemaat.',
    },
    templates: ['pastor', 'secretary'],
  },
] as const);
