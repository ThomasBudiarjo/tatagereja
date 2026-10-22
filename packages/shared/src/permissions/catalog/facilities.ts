import { definePermissions } from '../types';

/** Facilities (sarana), bookings and inventory (inventaris). */
export const FACILITIES_PERMISSIONS = definePermissions('facilities', [
  {
    key: 'facilities.view',
    label: { en: 'View facilities', id: 'Lihat sarana' },
    description: {
      en: 'See rooms and resources and when they are booked.',
      id: 'Melihat ruangan dan sarana beserta jadwal pemakaiannya.',
    },
    memberDefault: true,
  },
  {
    key: 'facilities.book',
    label: { en: 'Request bookings', id: 'Ajukan peminjaman' },
    description: {
      en: 'Request to book a room or resource.',
      id: 'Mengajukan peminjaman ruangan atau sarana.',
    },
    memberDefault: true,
  },
  {
    key: 'facilities.manage',
    label: { en: 'Manage facilities', id: 'Kelola sarana' },
    description: {
      en: 'Manage rooms and resources and approve or reject bookings.',
      id: 'Mengelola ruangan dan sarana serta menyetujui atau menolak peminjaman.',
    },
    templates: ['secretary'],
  },
  {
    key: 'inventory.view',
    label: { en: 'View inventory', id: 'Lihat inventaris' },
    description: {
      en: 'See inventory assets, loans and maintenance.',
      id: 'Melihat aset inventaris, peminjaman, dan perawatannya.',
    },
    templates: ['secretary'],
  },
  {
    key: 'inventory.manage',
    label: { en: 'Manage inventory', id: 'Kelola inventaris' },
    description: {
      en: 'Add assets, lend and return them and log maintenance.',
      id: 'Menambah aset, mencatat peminjaman dan pengembalian, serta perawatan.',
    },
    templates: ['secretary'],
  },
] as const);
