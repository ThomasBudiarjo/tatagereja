import { defineDictionary } from '@/lib/i18n/define';

export const adminSecurityDictionary = defineDictionary('admin-security', {
  en: {
    nav: 'Security & access',
    description: 'Roles and permissions, audit log, two-factor sign-in and the security policy.',
    planRoles: 'Roles and permissions',
    planRolesBody:
      'Custom roles such as Pendeta, Majelis or Bendahara built from granular permissions.',
    planAudit: 'Audit log',
    planAuditBody: 'Who changed what and when, with sensitive values redacted.',
    planTwoFactor: 'Two-factor sign-in',
    planTwoFactorBody: 'Authenticator codes and recovery codes for every account.',
    planPolicy: 'Security policy',
    planPolicyBody: 'Require two-factor sign-in for roles that handle sensitive data.',
    planLogins: 'Sign-in history',
    planLoginsBody: 'Recent sign-ins, failed attempts and locked accounts.',
    planExport: 'Data export',
    planExportBody: 'A complete backup of the church data for the owner.',
  },
  id: {
    nav: 'Keamanan & akses',
    description: 'Peran dan hak akses, log audit, verifikasi dua langkah, dan kebijakan keamanan.',
    planRoles: 'Peran dan hak akses',
    planRolesBody:
      'Peran khusus seperti Pendeta, Majelis, atau Bendahara yang disusun dari hak akses terperinci.',
    planAudit: 'Log audit',
    planAuditBody: 'Siapa mengubah apa dan kapan, dengan data sensitif disamarkan.',
    planTwoFactor: 'Verifikasi dua langkah',
    planTwoFactorBody: 'Kode aplikasi autentikator dan kode pemulihan untuk setiap akun.',
    planPolicy: 'Kebijakan keamanan',
    planPolicyBody: 'Wajibkan verifikasi dua langkah bagi peran yang mengelola data sensitif.',
    planLogins: 'Riwayat masuk',
    planLoginsBody: 'Riwayat masuk terbaru, percobaan gagal, dan akun yang terkunci.',
    planExport: 'Ekspor data',
    planExportBody: 'Cadangan lengkap data gereja untuk pemilik.',
  },
});
