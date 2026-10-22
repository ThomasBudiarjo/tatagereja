import type { LoginChallenge } from '@tatagereja/shared';
import { ArrowLeft, KeyRound, ShieldCheck, Smartphone, TimerOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Alert } from '@/components/ui/misc';
import { ToneIcon } from '@/components/ui/status-badge';
import { useLoginSecondStep } from '@/features/admin-security/api';
import { OtpInput } from '@/features/admin-security/components/otp-input';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Seconds left until a moment, refreshed every second. */
function useSecondsLeft(until: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
}

/**
 * The second sign-in step for accounts with two-step verification: a code from the
 * authenticator app (submitted as soon as six digits are in) or a recovery code. The
 * challenge expires after a few minutes; then the person starts again with the password.
 */
export function TwoFactorStep({
  challenge,
  onSignedIn,
  onRestart,
}: {
  challenge: LoginChallenge;
  onSignedIn: () => void;
  onRestart: () => void;
}) {
  const { t } = useI18n();
  const secondStep = useLoginSecondStep();
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [ended, setEnded] = useState(false);
  const left = useSecondsLeft(challenge.expiresAt);
  const expired = ended || left === 0;

  const submit = async (input = value) => {
    if (secondStep.isPending || expired) return;
    const complete = mode === 'totp' ? input.length === 6 : input.replace(/-/g, '').length === 10;
    if (!complete) {
      setError(mode === 'totp' ? t('profile.codeInvalid') : t('profile.recoveryInvalid'));
      return;
    }
    try {
      await secondStep.mutateAsync({
        challengeToken: challenge.challengeToken,
        ...(mode === 'totp' ? { code: input } : { recoveryCode: input }),
      });
      onSignedIn();
    } catch (caught) {
      setValue('');
      if (isApiClientError(caught) && caught.code === 'ACCOUNT_LOCKED') {
        setEnded(true);
        setError(t('auth.accountLocked'));
      } else if (isApiClientError(caught) && /expired/i.test(caught.message)) {
        setEnded(true);
      } else if (isApiClientError(caught) && caught.code === 'TWO_FACTOR_INVALID') {
        setError(mode === 'totp' ? t('auth.codeWrong') : t('auth.recoveryWrong'));
      } else {
        setError(getErrorMessage(caught));
      }
    }
  };

  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, '0');

  if (expired && !error) {
    return (
      <div className="flex animate-rise-in flex-col items-center gap-4 text-center">
        <ToneIcon icon={TimerOff} tone="warning" size="lg" />
        <div>
          <p className="font-semibold">{t('auth.challengeExpired')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('auth.challengeExpiredHint')}</p>
        </div>
        <Button onClick={onRestart} size="lg" className="w-full">
          {t('auth.loginAgain')}
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex animate-rise-in flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3">
        <ToneIcon icon={mode === 'totp' ? Smartphone : KeyRound} tone="emerald" size="sm" />
        <p className="text-sm text-pretty text-muted-foreground">
          {mode === 'totp' ? t('auth.twoFactorPrompt') : t('auth.recoveryPrompt')}
        </p>
      </div>
      {error && expired ? <Alert variant="error">{error}</Alert> : null}
      <Field
        label={mode === 'totp' ? t('profile.authenticatorCode') : t('profile.recoveryCode')}
        htmlFor="login-code"
        error={expired ? undefined : error}
        required
      >
        <OtpInput
          id="login-code"
          key={mode}
          mode={mode}
          autoFocus
          value={value}
          disabled={secondStep.isPending || expired}
          aria-invalid={!!error}
          onChange={(next) => {
            setValue(next);
            setError(undefined);
          }}
          onComplete={(next) => void submit(next)}
        />
      </Field>
      <p className="text-center text-xs text-muted-foreground tabular" aria-live="off">
        {t('auth.challengeTimer', { time: `${minutes}:${seconds}` })}
      </p>
      <FormActions className="sm:flex-col">
        <Button type="submit" size="lg" loading={secondStep.isPending} disabled={expired}>
          <ShieldCheck />
          {t('auth.verify')}
        </Button>
      </FormActions>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onRestart}>
          <ArrowLeft />
          {t('auth.useOtherAccount')}
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0"
          onClick={() => {
            setMode(mode === 'totp' ? 'recovery' : 'totp');
            setValue('');
            setError(undefined);
          }}
        >
          {mode === 'totp' ? t('profile.useRecoveryInstead') : t('profile.useAppInstead')}
        </Button>
      </div>
    </form>
  );
}
