import { definePermissions } from '../types';

/** Church profile, member accounts, roles, invitations, settings and audit log. */
export const CORE_PERMISSIONS = definePermissions('core', [
  {
    key: 'church.edit',
    label: { en: 'Edit church profile', id: 'Ubah profil gereja' },
    description: {
      en: 'Change the church name, contact details, logo, brand colour, currency and time zone.',
      id: 'Mengubah nama, kontak, logo, warna, mata uang, dan zona waktu gereja.',
    },
  },
  {
    key: 'church.delete',
    label: { en: 'Delete church', id: 'Hapus gereja' },
    description: {
      en: 'Permanently delete the church and everything recorded in it.',
      id: 'Menghapus gereja beserta seluruh datanya secara permanen.',
    },
    sensitive: true,
    ownerOnly: true,
  },
  {
    key: 'church.transfer',
    label: { en: 'Transfer ownership', id: 'Alihkan kepemilikan' },
    description: {
      en: 'Hand the owner role to another member.',
      id: 'Menyerahkan peran pemilik kepada anggota lain.',
    },
    sensitive: true,
    ownerOnly: true,
  },
  {
    key: 'members.view',
    label: { en: 'View member accounts', id: 'Lihat akun anggota' },
    description: {
      en: 'See who has an account in this church, their roles and status.',
      id: 'Melihat siapa saja yang memiliki akun di gereja ini, beserta peran dan statusnya.',
    },
    templates: ['pastor', 'elder', 'secretary'],
  },
  {
    key: 'members.manage',
    label: { en: 'Manage member accounts', id: 'Kelola akun anggota' },
    description: {
      en: 'Change base roles, suspend, reactivate and remove member accounts.',
      id: 'Mengubah peran dasar, menangguhkan, mengaktifkan kembali, dan mengeluarkan akun anggota.',
    },
    sensitive: true,
  },
  {
    key: 'roles.manage',
    label: { en: 'Manage roles and permissions', id: 'Kelola peran dan hak akses' },
    description: {
      en: 'Create and edit custom roles and assign them to members. Nobody can grant a permission they do not hold.',
      id: 'Membuat dan mengubah peran khusus serta menetapkannya kepada anggota. Tidak ada yang dapat memberikan hak akses yang tidak dimilikinya.',
    },
    sensitive: true,
  },
  {
    key: 'invitations.manage',
    label: { en: 'Manage invitations', id: 'Kelola undangan' },
    description: {
      en: 'Create, share and revoke invitation links and QR codes.',
      id: 'Membuat, membagikan, dan mencabut tautan serta kode QR undangan.',
    },
    templates: ['secretary'],
  },
  {
    key: 'settings.manage',
    label: { en: 'Manage church settings', id: 'Kelola pengaturan gereja' },
    description: {
      en: 'Turn optional modules on or off and change church-wide settings.',
      id: 'Mengaktifkan atau menonaktifkan modul dan mengubah pengaturan gereja.',
    },
  },
  {
    key: 'audit.view',
    label: { en: 'View audit log', id: 'Lihat log audit' },
    description: {
      en: 'See who changed what and when, including before and after values.',
      id: 'Melihat siapa mengubah apa dan kapan, termasuk nilai sebelum dan sesudahnya.',
    },
    sensitive: true,
  },
] as const);
