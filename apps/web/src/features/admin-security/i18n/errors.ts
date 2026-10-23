import { messages } from './section';

/** Server answers of the module in the interface language (see `errors.ts`). */
export const errorMessages = messages(
  {
    errPasswordIncorrect: 'Password is incorrect',
    errPasswordSame: 'Choose a password different from the current one',
    errChurchName: 'Type the church name exactly as shown',
    errRecoveryInvalid: 'This recovery code is not valid or was already used',
    errCodeInvalid: 'The code is not valid. Check the time on your phone and try again',
    errCodeRequired: 'Enter a code from your authenticator app or a recovery code',
    errChallengeExpired: 'This sign-in has expired. Log in again',
    errRoleNameTaken: 'A role with this name already exists',
    errTransferSuspended: 'Reactivate this member before handing them ownership',
    errOwnerLeave: 'Transfer ownership to another member before leaving the church',
    errAlreadyOwner: 'You already own this church',
    errSetupFirst: 'Start the setup again',
    errTwoFactorOn: 'Two-step verification is already on',
    errTwoFactorOff: 'Two-step verification is not on',
    errEscalation: 'This involves permissions you do not hold yourself, so you cannot change it',
    errLockout: 'This change would remove your own permission to manage roles',
    errSetupRequired: 'Turn on two-step verification for your own account first',
  },
  {
    errPasswordIncorrect: 'Kata sandi salah',
    errPasswordSame: 'Pilih kata sandi yang berbeda dari kata sandi saat ini',
    errChurchName: 'Ketik nama gereja persis seperti yang tertulis',
    errRecoveryInvalid: 'Kode pemulihan ini tidak berlaku atau sudah dipakai',
    errCodeInvalid: 'Kode tidak berlaku. Periksa jam di ponsel Anda lalu coba lagi',
    errCodeRequired: 'Masukkan kode dari aplikasi autentikator atau kode pemulihan',
    errChallengeExpired: 'Proses masuk ini sudah kedaluwarsa. Silakan masuk lagi',
    errRoleNameTaken: 'Sudah ada peran dengan nama ini',
    errTransferSuspended: 'Aktifkan kembali anggota ini sebelum menyerahkan kepemilikan',
    errOwnerLeave: 'Serahkan kepemilikan kepada anggota lain sebelum keluar dari gereja',
    errAlreadyOwner: 'Anda sudah menjadi pemilik gereja ini',
    errSetupFirst: 'Mulai ulang pengaturan',
    errTwoFactorOn: 'Verifikasi dua langkah sudah aktif',
    errTwoFactorOff: 'Verifikasi dua langkah belum aktif',
    errEscalation:
      'Perubahan ini menyangkut hak akses yang tidak Anda miliki, jadi tidak dapat Anda ubah',
    errLockout: 'Perubahan ini akan mencabut hak Anda sendiri untuk mengelola peran',
    errSetupRequired: 'Aktifkan verifikasi dua langkah untuk akun Anda sendiri terlebih dahulu',
  },
);
