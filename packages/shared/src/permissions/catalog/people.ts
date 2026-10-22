import { definePermissions } from '../types';

/** Directory, households, areas (wilayah/sektor), groups and ministries (komisi). */
export const PEOPLE_PERMISSIONS = definePermissions('people', [
  {
    key: 'people.view',
    label: { en: 'View directory', id: 'Lihat direktori jemaat' },
    description: {
      en: 'Browse the church directory. Fields a person keeps private stay hidden.',
      id: 'Melihat direktori jemaat. Data yang dirahasiakan tetap tersembunyi.',
    },
    memberDefault: true,
  },
  {
    key: 'people.create',
    label: { en: 'Add people', id: 'Tambah data jemaat' },
    description: {
      en: 'Add people to the directory, including CSV import.',
      id: 'Menambahkan jemaat ke direktori, termasuk impor CSV.',
    },
    templates: ['secretary'],
  },
  {
    key: 'people.edit',
    label: { en: 'Edit people', id: 'Ubah data jemaat' },
    description: {
      en: 'Edit anyone in the directory, including membership status and join date.',
      id: 'Mengubah data siapa pun di direktori, termasuk status keanggotaan dan tanggal bergabung.',
    },
    templates: ['pastor', 'secretary'],
  },
  {
    key: 'people.delete',
    label: { en: 'Delete people', id: 'Hapus data jemaat' },
    description: {
      en: 'Permanently delete person records.',
      id: 'Menghapus data jemaat secara permanen.',
    },
    sensitive: true,
  },
  {
    key: 'people.private.view',
    label: { en: 'View private details', id: 'Lihat data pribadi' },
    description: {
      en: 'See private details such as national ID, medical notes and hidden contact fields.',
      id: 'Melihat data pribadi seperti NIK, catatan kesehatan, dan kontak yang dirahasiakan.',
    },
    sensitive: true,
    templates: ['pastor', 'elder', 'secretary'],
  },
  {
    key: 'people.private.edit',
    label: { en: 'Edit private details', id: 'Ubah data pribadi' },
    description: {
      en: 'Change private details of anyone in the directory.',
      id: 'Mengubah data pribadi siapa pun di direktori.',
    },
    sensitive: true,
    templates: ['pastor', 'secretary'],
  },
  {
    key: 'people.link',
    label: { en: 'Link login accounts', id: 'Tautkan akun login' },
    description: {
      en: 'Connect a person record to a member account.',
      id: 'Menghubungkan data jemaat dengan akun anggota.',
    },
    templates: ['secretary'],
  },
  {
    key: 'people.export',
    label: { en: 'Export people', id: 'Ekspor data jemaat' },
    description: {
      en: 'Download the directory as CSV. Every export is recorded in the audit log.',
      id: 'Mengunduh direktori sebagai CSV. Setiap ekspor dicatat di log audit.',
    },
    sensitive: true,
    templates: ['secretary'],
  },
  {
    key: 'people.merge',
    label: { en: 'Merge duplicates', id: 'Gabungkan data ganda' },
    description: {
      en: 'Merge two records of the same person, moving everything linked to them.',
      id: 'Menggabungkan dua data dari orang yang sama beserta seluruh keterkaitannya.',
    },
    sensitive: true,
    templates: ['secretary'],
  },
  {
    key: 'people.fields.manage',
    label: { en: 'Manage tags and custom fields', id: 'Kelola label dan kolom tambahan' },
    description: {
      en: 'Define the tags and custom fields used on person records.',
      id: 'Menentukan label dan kolom tambahan pada data jemaat.',
    },
    templates: ['secretary'],
  },
  {
    key: 'households.manage',
    label: { en: 'Manage households', id: 'Kelola keluarga' },
    description: {
      en: 'Create households (kepala keluarga, spouse, children) and move people between them.',
      id: 'Membuat data keluarga (kepala keluarga, pasangan, anak) dan memindahkan anggota keluarga.',
    },
    templates: ['pastor', 'secretary'],
  },
  {
    key: 'areas.manage',
    label: { en: 'Manage areas', id: 'Kelola wilayah/sektor' },
    description: {
      en: 'Define areas (wilayah, sektor, rayon), their coordinators and who belongs to them.',
      id: 'Menentukan wilayah, sektor, atau rayon beserta koordinator dan anggotanya.',
    },
    templates: ['secretary'],
  },
  {
    key: 'groups.view',
    label: { en: 'View groups', id: 'Lihat kelompok' },
    description: {
      en: 'See groups, ministries (komisi) and their members.',
      id: 'Melihat kelompok, komisi, dan anggotanya.',
    },
    memberDefault: true,
  },
  {
    key: 'groups.create',
    label: { en: 'Create groups', id: 'Buat kelompok' },
    description: {
      en: 'Create new groups and ministries.',
      id: 'Membuat kelompok dan komisi baru.',
    },
    templates: ['secretary', 'ministry_coordinator'],
  },
  {
    key: 'groups.manage',
    label: { en: 'Manage all groups', id: 'Kelola semua kelompok' },
    description: {
      en: 'Edit any group and its members. Group leaders manage their own groups without this.',
      id: 'Mengubah kelompok mana pun beserta anggotanya. Ketua kelompok tetap dapat mengelola kelompoknya sendiri.',
    },
    templates: ['ministry_coordinator'],
  },
  {
    key: 'groups.delete',
    label: { en: 'Delete groups', id: 'Hapus kelompok' },
    description: {
      en: 'Delete groups together with their events and attendance.',
      id: 'Menghapus kelompok beserta kegiatan dan kehadirannya.',
    },
  },
  {
    key: 'groups.leaders.assign',
    label: { en: 'Assign group leaders', id: 'Tetapkan ketua kelompok' },
    description: {
      en: 'Choose which members lead each group.',
      id: 'Menentukan anggota yang memimpin setiap kelompok.',
    },
    templates: ['ministry_coordinator'],
  },
] as const);
