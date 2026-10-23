import { ApiClientError, isApiClientError, type ClientErrorCode } from '@/lib/api';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The server answers in English. Messages this module's endpoints send (whole or per field)
 * are swapped for the interface language here, so toasts and field errors never mix
 * languages; anything not listed passes through unchanged.
 */
const MESSAGE_KEYS: Record<string, MessageKey> = {
  'Password is incorrect': 'admin-security.errPasswordIncorrect',
  'Current password is incorrect': 'admin-security.errPasswordIncorrect',
  'Choose a password different from the current one': 'admin-security.errPasswordSame',
  'Type the church name exactly as shown': 'admin-security.errChurchName',
  'This recovery code is not valid or was already used': 'admin-security.errRecoveryInvalid',
  'The code is not valid. Check the time on your phone and try again':
    'admin-security.errCodeInvalid',
  'This sign-in has expired. Log in again': 'admin-security.errChallengeExpired',
  'A role with this name already exists': 'admin-security.errRoleNameTaken',
  'Reactivate this member before handing them ownership': 'admin-security.errTransferSuspended',
  'Transfer ownership to another member before leaving the church': 'admin-security.errOwnerLeave',
  'You already own this church': 'admin-security.errAlreadyOwner',
  'Start the setup first': 'admin-security.errSetupFirst',
  'Two-step verification is already on': 'admin-security.errTwoFactorOn',
  'Two-step verification is already on. Turn it off first to start over':
    'admin-security.errTwoFactorOn',
  'Two-step verification is not on': 'admin-security.errTwoFactorOff',
  'Enter the 6-digit code': 'profile.codeInvalid',
  'Enter the recovery code': 'profile.recoveryInvalid',
};

/** Codes whose message is the same for every request of the module. */
const CODE_KEYS: Partial<Record<ClientErrorCode, MessageKey>> = {
  ESCALATION_DENIED: 'admin-security.errEscalation',
  LOCKOUT_PREVENTED: 'admin-security.errLockout',
  TWO_FACTOR_REQUIRED: 'admin-security.errCodeRequired',
  TWO_FACTOR_SETUP_REQUIRED: 'admin-security.errSetupRequired',
};

const translated = (message: string) => {
  const key = MESSAGE_KEYS[message];
  return key ? t(key) : message;
};

export function localizeSecurityError(error: unknown): unknown {
  if (!isApiClientError(error)) return error;
  const key = CODE_KEYS[error.code];
  return new ApiClientError(
    error.code,
    key ? t(key) : translated(error.message),
    error.status,
    error.issues.map((issue) => ({ ...issue, message: translated(issue.message) })),
  );
}
