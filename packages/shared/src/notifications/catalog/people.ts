import { defineNotificationTypes } from '../types';

/** Notification types of the people module. Add entries here; they appear in preferences automatically. */
export const PEOPLE_NOTIFICATION_TYPES = defineNotificationTypes('people', [
  {
    type: 'group.join_requested',
    label: { en: 'Group join requests', id: 'Permintaan bergabung kelompok' },
    description: {
      en: 'When someone asks to join a group you lead or manage.',
      id: 'Saat seseorang meminta bergabung dengan kelompok yang Anda pimpin atau kelola.',
    },
  },
  {
    type: 'group.join_decided',
    label: { en: 'Join request answers', id: 'Jawaban permintaan bergabung' },
    description: {
      en: 'When your request to join a group is approved or declined.',
      id: 'Saat permintaan Anda untuk bergabung dengan kelompok disetujui atau ditolak.',
    },
  },
  {
    type: 'group.member_added',
    label: { en: 'Added to a group', id: 'Ditambahkan ke kelompok' },
    description: {
      en: 'When a leader adds you to a group or komisi.',
      id: 'Saat pemimpin menambahkan Anda ke kelompok atau komisi.',
    },
  },
  {
    type: 'group.leader_assigned',
    label: { en: 'Group leadership', id: 'Penugasan pemimpin kelompok' },
    description: {
      en: 'When you are made a leader of a group.',
      id: 'Saat Anda ditetapkan sebagai pemimpin kelompok.',
    },
  },
  {
    type: 'area.coordinator_assigned',
    label: { en: 'Area coordination', id: 'Penugasan koordinator wilayah' },
    description: {
      en: 'When you are made coordinator of an area (wilayah/sektor).',
      id: 'Saat Anda ditetapkan sebagai koordinator wilayah atau sektor.',
    },
  },
  {
    type: 'household.added',
    label: { en: 'Family records', id: 'Data keluarga' },
    description: {
      en: 'When you are added to a household in the directory.',
      id: 'Saat Anda dimasukkan ke dalam data keluarga di direktori.',
    },
    defaultInApp: false,
  },
] as const);
