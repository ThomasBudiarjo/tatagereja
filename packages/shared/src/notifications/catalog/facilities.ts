import { defineNotificationTypes } from '../types';

/** Notification types of the facilities module. Add entries here; they appear in preferences automatically. */
export const FACILITIES_NOTIFICATION_TYPES = defineNotificationTypes('facilities', [
  {
    type: 'booking.requested',
    label: { en: 'Booking requests', id: 'Pengajuan peminjaman' },
    description: {
      en: 'When someone requests a room or resource that needs your approval.',
      id: 'Saat seseorang mengajukan peminjaman ruangan atau sarana yang perlu Anda setujui.',
    },
  },
  {
    type: 'booking.decided',
    label: { en: 'Booking decisions', id: 'Keputusan peminjaman' },
    description: {
      en: 'When your booking request is approved or rejected.',
      id: 'Saat pengajuan peminjaman Anda disetujui atau ditolak.',
    },
  },
  {
    type: 'booking.cancelled',
    label: { en: 'Cancelled bookings', id: 'Peminjaman dibatalkan' },
    description: {
      en: 'When a manager cancels your booking or one of its dates.',
      id: 'Saat pengelola membatalkan peminjaman Anda atau salah satu jadwalnya.',
    },
  },
  {
    type: 'asset.checked_out',
    label: { en: 'Inventory loans', id: 'Peminjaman inventaris' },
    description: {
      en: 'When an inventory item is lent to you, with its due date.',
      id: 'Saat barang inventaris dipinjamkan kepada Anda, beserta tanggal pengembaliannya.',
    },
  },
] as const);
