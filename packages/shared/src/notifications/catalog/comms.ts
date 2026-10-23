import { defineNotificationTypes } from '../types';

/** Notification types of the comms module. Add entries here; they appear in preferences automatically. */
export const COMMS_NOTIFICATION_TYPES = defineNotificationTypes('comms', [
  {
    type: 'announcement.published',
    label: { en: 'New announcements', id: 'Pengumuman baru' },
    description: {
      en: 'When an announcement for you is published.',
      id: 'Saat pengumuman untuk Anda diterbitkan.',
    },
  },
  {
    type: 'event.created',
    label: { en: 'Group events', id: 'Kegiatan kelompok' },
    description: {
      en: 'When an event is planned for a group you belong to.',
      id: 'Saat kegiatan direncanakan untuk kelompok Anda.',
    },
  },
  {
    type: 'event.changed',
    label: { en: 'Event changes', id: 'Perubahan kegiatan' },
    description: {
      en: 'When an event you registered for or attend moves or is cancelled.',
      id: 'Saat kegiatan yang Anda ikuti dipindah jadwalnya atau dibatalkan.',
    },
  },
  {
    type: 'event.registration',
    label: { en: 'My registrations', id: 'Pendaftaran saya' },
    description: {
      en: 'Confirmation of a registration, a waitlist place, or a place that opened up.',
      id: 'Konfirmasi pendaftaran, posisi daftar tunggu, atau tempat yang tersedia.',
    },
  },
  {
    type: 'event.registrations',
    label: { en: 'Registrations for my events', id: 'Pendaftar kegiatan saya' },
    description: {
      en: 'When someone registers for or cancels at an event you organise.',
      id: 'Saat seseorang mendaftar atau membatalkan pada kegiatan yang Anda kelola.',
    },
    defaultInApp: false,
  },
  {
    type: 'bulletin.published',
    label: { en: 'Warta Jemaat', id: 'Warta Jemaat' },
    description: {
      en: 'When the weekly bulletin is published.',
      id: 'Saat Warta Jemaat mingguan diterbitkan.',
    },
  },
] as const);
