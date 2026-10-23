import { defineNotificationTypes } from '../types';

/** Notification types of the finance module. Add entries here; they appear in preferences automatically. */
export const FINANCE_NOTIFICATION_TYPES = defineNotificationTypes('finance', [
  {
    type: 'finance.offering_submitted',
    label: { en: 'Offering counts to verify', id: 'Hitungan persembahan untuk diverifikasi' },
    description: {
      en: 'When a service offering count waits for your verification.',
      id: 'Saat hitungan persembahan ibadah menunggu verifikasi Anda.',
    },
  },
  {
    type: 'finance.offering_returned',
    label: { en: 'Offering counts returned', id: 'Hitungan persembahan dikembalikan' },
    description: {
      en: 'When an offering count you submitted is sent back for correction.',
      id: 'Saat hitungan persembahan yang Anda ajukan dikembalikan untuk diperbaiki.',
    },
  },
  {
    type: 'finance.expense_submitted',
    label: { en: 'Expense requests to approve', id: 'Pengajuan dana untuk disetujui' },
    description: {
      en: 'When an expense request or reimbursement waits for approval.',
      id: 'Saat pengajuan dana atau penggantian biaya menunggu persetujuan.',
    },
  },
  {
    type: 'finance.expense_decided',
    label: { en: 'Your expense requests', id: 'Pengajuan dana Anda' },
    description: {
      en: 'When your expense request is approved, rejected or paid.',
      id: 'Saat pengajuan dana Anda disetujui, ditolak, atau dibayarkan.',
    },
  },
  {
    type: 'finance.period_reopened',
    label: { en: 'Reopened periods', id: 'Periode dibuka kembali' },
    description: {
      en: 'When a closed month is reopened for changes.',
      id: 'Saat bulan yang sudah tutup buku dibuka kembali untuk perubahan.',
    },
  },
] as const);
