import { defineNotificationTypes } from '../types';

/** Notification types of the care module. Add entries here; they appear in preferences automatically. */
export const CARE_NOTIFICATION_TYPES = defineNotificationTypes('care', [
  {
    type: 'care.case_assigned',
    label: { en: 'Care assignments', id: 'Penugasan pendampingan' },
    description: {
      en: 'When you are assigned as a caregiver for someone.',
      id: 'Saat Anda ditugaskan mendampingi seseorang.',
    },
  },
  {
    type: 'care.reminder',
    label: { en: 'Care reminders', id: 'Pengingat pelayanan pastoral' },
    description: {
      en: 'When a next step on a case you accompany or a task of yours is due.',
      id: 'Saat langkah berikutnya pada pendampingan Anda atau tugas Anda jatuh tempo.',
    },
  },
  {
    type: 'care.task_assigned',
    label: { en: 'Follow-up tasks', id: 'Tugas tindak lanjut' },
    description: {
      en: 'When someone gives you a follow-up task.',
      id: 'Saat seseorang memberi Anda tugas tindak lanjut.',
    },
  },
  {
    type: 'care.follow_up_assigned',
    label: { en: 'Visitors to follow up', id: 'Tamu untuk ditindaklanjuti' },
    description: {
      en: 'When a new visitor is assigned to you for follow-up.',
      id: 'Saat seorang tamu baru diserahkan kepada Anda untuk ditindaklanjuti.',
    },
  },
  {
    type: 'prayer.submitted',
    label: { en: 'New prayer requests', id: 'Pokok doa baru' },
    description: {
      en: 'When a prayer request waits for review or is shared with the care team.',
      id: 'Saat pokok doa menunggu ditinjau atau dibagikan kepada tim pastoral.',
    },
  },
  {
    type: 'prayer.moderated',
    label: { en: 'Your prayer requests', id: 'Pokok doa Anda' },
    description: {
      en: 'When your prayer request is shared with the church or not shared.',
      id: 'Saat pokok doa Anda dibagikan kepada jemaat atau tidak dibagikan.',
    },
  },
  {
    type: 'prayer.answered',
    label: { en: 'Answered prayers', id: 'Doa yang dijawab' },
    description: {
      en: 'When a request you prayed for is marked answered.',
      id: 'Saat pokok doa yang Anda doakan ditandai sudah dijawab.',
    },
  },
] as const);
