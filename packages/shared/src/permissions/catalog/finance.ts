import { definePermissions } from '../types';

/** Finance (keuangan): persembahan, perpuluhan, pengeluaran, anggaran and reports. */
export const FINANCE_PERMISSIONS = definePermissions('finance', [
  {
    key: 'finance.view',
    label: { en: 'View finance', id: 'Lihat keuangan' },
    description: {
      en: 'See balances, transactions and contributions. Members always see their own giving.',
      id: 'Melihat saldo, transaksi, dan persembahan. Anggota selalu dapat melihat persembahannya sendiri.',
    },
    sensitive: true,
    templates: ['pastor', 'elder', 'treasurer'],
  },
  {
    key: 'finance.record',
    label: { en: 'Record transactions', id: 'Catat transaksi' },
    description: {
      en: 'Count offerings, record contributions and submit expense requests.',
      id: 'Menghitung persembahan, mencatat persembahan perorangan, dan mengajukan pengeluaran.',
    },
    sensitive: true,
    templates: ['treasurer'],
  },
  {
    key: 'finance.approve',
    label: { en: 'Approve and verify', id: 'Setujui dan verifikasi' },
    description: {
      en: 'Verify offering counts and approve expenses. Nobody can approve their own request.',
      id: 'Memverifikasi hitungan persembahan dan menyetujui pengeluaran. Tidak ada yang dapat menyetujui pengajuannya sendiri.',
    },
    sensitive: true,
    templates: ['elder', 'treasurer'],
  },
  {
    key: 'finance.manage',
    label: { en: 'Manage finance setup', id: 'Kelola pengaturan keuangan' },
    description: {
      en: 'Manage funds, accounts, budgets (RAPB) and close or reopen periods.',
      id: 'Mengelola kas, rekening, anggaran (RAPB), serta menutup atau membuka kembali periode.',
    },
    sensitive: true,
    templates: ['treasurer'],
  },
  {
    key: 'finance.reports',
    label: { en: 'View finance reports', id: 'Lihat laporan keuangan' },
    description: {
      en: 'See income and expense reports, cash flow and giving statements.',
      id: 'Melihat laporan pemasukan dan pengeluaran, arus kas, dan rekap persembahan.',
    },
    sensitive: true,
    templates: ['pastor', 'elder', 'treasurer'],
  },
] as const);
