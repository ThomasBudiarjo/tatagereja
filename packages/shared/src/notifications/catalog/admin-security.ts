import { defineNotificationTypes } from '../types';

/**
 * Notification types of the admin-security module. Account notices are delivered without a
 * church (`churchId: null`) and are mandatory: they are the owner's only signal that someone
 * else may be using the account.
 */
export const ADMIN_SECURITY_NOTIFICATION_TYPES = defineNotificationTypes('admin-security', [
  {
    type: 'account.password_changed',
    label: { en: 'Password changed', id: 'Kata sandi diganti' },
    description: {
      en: 'When the password of your account is changed.',
      id: 'Saat kata sandi akun Anda diganti.',
    },
    mandatory: true,
  },
  {
    type: 'account.two_factor_changed',
    label: { en: 'Two-step verification', id: 'Verifikasi dua langkah' },
    description: {
      en: 'When two-step verification is turned on or off, or new recovery codes are made.',
      id: 'Saat verifikasi dua langkah diaktifkan, dinonaktifkan, atau kode pemulihan dibuat ulang.',
    },
    mandatory: true,
  },
  {
    type: 'account.locked',
    label: { en: 'Account locked', id: 'Akun terkunci' },
    description: {
      en: 'When sign-in is paused after repeated wrong passwords.',
      id: 'Saat proses masuk dihentikan sementara setelah kata sandi salah berulang kali.',
    },
    mandatory: true,
  },
  {
    type: 'security.policy_changed',
    label: { en: 'Church security policy', id: 'Kebijakan keamanan gereja' },
    description: {
      en: 'When the church starts or stops requiring two-step verification for your role.',
      id: 'Saat gereja mulai atau berhenti mewajibkan verifikasi dua langkah untuk peran Anda.',
    },
    mandatory: true,
  },
] as const);
