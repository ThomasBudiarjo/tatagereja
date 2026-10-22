import { twoFactorSetupBodySchema, type TwoFactorSetupBody } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  KeyRound,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyButton } from '@/components/ui/copy-button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/input';
import { Alert, ErrorState } from '@/components/ui/misc';
import { QrDisplay } from '@/components/ui/qr-code';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { Stepper } from '@/components/ui/stepper';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { useChurchesRequiring } from './use-churches-requiring';
import {
  twoFactorStatusQuery,
  useDisableTwoFactor,
  useEnableTwoFactor,
  useRegenerateRecoveryCodes,
  useStartTwoFactorSetup,
} from '../api';
import { OtpInput } from '../components/otp-input';
import { RecoveryCodesView } from './recovery-codes';
import { secondFactorBody, useSecondFactorForm } from './second-factor';
import { SecondFactorActions, SecondFactorFields } from './second-factor-form';

/** The secret in groups of four, easier to type into an authenticator app by hand. */
const groupSecret = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

function SetupDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const start = useStartTwoFactorSetup();
  const enable = useEnableTwoFactor();
  const form = useForm<TwoFactorSetupBody>({
    resolver: zodResolver(twoFactorSetupBodySchema),
    defaultValues: { password: '' },
  });

  const reset = () => {
    setStep(0);
    setSetup(null);
    setCode('');
    setCodeError(undefined);
    setCodes(null);
    setSaved(false);
    form.reset();
  };
  const close = (next: boolean) => {
    if (start.isPending || enable.isPending) return;
    if (!next) {
      if (codes) onDone?.();
      reset();
    }
    onOpenChange(next);
  };

  const submitPassword = form.handleSubmit(async (values) => {
    if (start.isPending) return;
    try {
      setSetup(await start.mutateAsync(values.password));
      setStep(1);
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['password']))
        toast.error(getErrorMessage(error));
    }
  });

  const verify = async (value = code) => {
    if (enable.isPending) return;
    if (value.length !== 6) {
      setCodeError(t('profile.codeInvalid'));
      return;
    }
    try {
      const result = await enable.mutateAsync(value);
      setCodes(result.recoveryCodes);
      setStep(3);
      toast.success(t('profile.twoFactorEnabled'));
    } catch (error) {
      setCode('');
      const issue = isApiClientError(error) ? error.issues[0] : undefined;
      setCodeError(issue?.message ?? getErrorMessage(error));
    }
  };

  const steps = [
    { id: 'password', label: t('profile.setupStepPassword') },
    { id: 'scan', label: t('profile.setupStepScan') },
    { id: 'verify', label: t('profile.setupStepVerify') },
    { id: 'codes', label: t('profile.setupStepCodes') },
  ];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('profile.setupTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('profile.setupIntro')}</DialogDescription>
        </DialogHeader>
        <Stepper steps={steps} current={step} />
        <DialogBody className="flex flex-col gap-4">
          {step === 0 ? (
            <form
              id="setup-password"
              onSubmit={(event) => void submitPassword(event)}
              noValidate
              className="flex flex-col gap-4"
            >
              <p className="text-sm text-pretty text-muted-foreground">{t('profile.setupIntro')}</p>
              <Field
                label={t('profile.currentPassword')}
                htmlFor="setup-password-input"
                error={form.formState.errors.password?.message}
                required
              >
                <PasswordInput
                  id="setup-password-input"
                  autoComplete="current-password"
                  autoFocus
                  aria-invalid={!!form.formState.errors.password}
                  {...form.register('password')}
                />
              </Field>
            </form>
          ) : step === 1 && setup ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-sm text-pretty text-muted-foreground">{t('profile.setupScan')}</p>
              <QrDisplay value={setup.otpauthUrl} size={184} />
              <details className="w-full rounded-xl border border-border/70 px-3 py-2 text-left text-sm">
                <summary className="cursor-pointer font-medium">{t('profile.setupManual')}</summary>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all select-all">
                    {groupSecret(setup.secret)}
                  </code>
                  <CopyButton value={setup.secret} iconOnly />
                </div>
              </details>
            </div>
          ) : step === 2 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-pretty text-muted-foreground">
                {t('profile.setupVerify')}
              </p>
              <Field
                label={t('profile.authenticatorCode')}
                htmlFor="setup-code"
                error={codeError}
                required
              >
                <OtpInput
                  id="setup-code"
                  autoFocus
                  value={code}
                  onChange={(value) => {
                    setCode(value);
                    setCodeError(undefined);
                  }}
                  onComplete={(value) => void verify(value)}
                  aria-invalid={!!codeError}
                  disabled={enable.isPending}
                />
              </Field>
            </div>
          ) : codes ? (
            <div className="flex flex-col gap-4">
              <RecoveryCodesView codes={codes} />
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
                <Checkbox checked={saved} onCheckedChange={(value) => setSaved(value === true)} />
                {t('profile.recoverySavedConfirm')}
              </label>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {step === 0 ? (
            <>
              <Button variant="outline" onClick={() => close(false)} disabled={start.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" form="setup-password" loading={start.isPending}>
                {t('common.continue')}
              </Button>
            </>
          ) : step === 1 ? (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => setStep(2)}>{t('profile.setupScanned')}</Button>
            </>
          ) : step === 2 ? (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={enable.isPending}>
                {t('common.back')}
              </Button>
              <Button onClick={() => void verify()} loading={enable.isPending}>
                {t('profile.setupActivate')}
              </Button>
            </>
          ) : (
            <Button onClick={() => close(false)} disabled={!saved}>
              {t('common.done')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmFactorDialog({
  open,
  onOpenChange,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'disable' | 'regenerate';
}) {
  const { t } = useI18n();
  const form = useSecondFactorForm();
  const disable = useDisableTwoFactor();
  const regenerate = useRegenerateRecoveryCodes();
  const [codes, setCodes] = useState<string[] | null>(null);
  const pending = disable.isPending || regenerate.isPending;
  const close = (next: boolean) => {
    if (pending) return;
    if (!next) {
      form.reset();
      setCodes(null);
    }
    onOpenChange(next);
  };
  const submit = form.handleSubmit(async (values) => {
    if (pending) return;
    try {
      if (kind === 'disable') {
        await disable.mutateAsync(secondFactorBody(values));
        toast.success(t('profile.twoFactorDisabled'));
        close(false);
      } else {
        const result = await regenerate.mutateAsync(secondFactorBody(values));
        setCodes(result.recoveryCodes);
        toast.success(t('profile.recoveryRegenerated'));
      }
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['password', 'code', 'recoveryCode'])) {
        toast.error(getErrorMessage(error));
      }
    }
  });
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === 'disable' ? t('profile.disableTitle') : t('profile.regenerateTitle')}
          </DialogTitle>
          <DialogDescription>
            {kind === 'disable' ? t('profile.disableBody') : t('profile.regenerateBody')}
          </DialogDescription>
        </DialogHeader>
        {codes ? (
          <>
            <DialogBody>
              <RecoveryCodesView codes={codes} />
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => close(false)}>{t('common.done')}</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
            {kind === 'disable' ? (
              <Alert variant="warning">{t('profile.disableWarning')}</Alert>
            ) : null}
            <SecondFactorFields form={form} idPrefix={kind} />
            <SecondFactorActions
              onCancel={() => close(false)}
              pending={pending}
              variant={kind === 'disable' ? 'destructive' : 'default'}
              submitLabel={
                kind === 'disable' ? t('profile.disableAction') : t('profile.regenerateAction')
              }
            />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Two-step verification on the account page: status, setup with a QR code and a code check,
 * recovery codes, and turning it off. `autoStart` opens the setup (deep links from the church
 * policy).
 */
export function TwoFactorCard({
  autoStart = false,
  onSetupDone,
}: {
  autoStart?: boolean;
  onSetupDone?: () => void;
}) {
  const { t, formatDate } = useI18n();
  const status = useQuery(twoFactorStatusQuery());
  const requiring = useChurchesRequiring(status.data?.requiredByChurchIds ?? []);
  const [setupOpen, setSetupOpen] = useState(false);
  const [confirm, setConfirm] = useState<'disable' | 'regenerate'>('regenerate');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const openConfirm = (kind: 'disable' | 'regenerate') => {
    setConfirm(kind);
    setConfirmOpen(true);
  };

  // A deep link (`?setup=1`) opens the setup once the status shows 2FA is off.
  const [autoOpened, setAutoOpened] = useState(false);
  if (autoStart && !autoOpened && status.data && !status.data.enabled) {
    setAutoOpened(true);
    setSetupOpen(true);
  }

  if (status.isPending) return <Skeleton className="h-44 rounded-xl" />;
  if (status.isError) {
    return (
      <ErrorState
        compact
        error={status.error}
        message={getErrorMessage(status.error)}
        onRetry={() => void status.refetch()}
        retrying={status.isFetching}
      />
    );
  }
  const data = status.data;
  const low = data.enabled && data.recoveryCodesRemaining <= 3;

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <ToneIcon
          icon={data.enabled ? ShieldCheck : ShieldOff}
          tone={data.enabled ? 'success' : 'warning'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{t('profile.twoFactorTitle')}</CardTitle>
            <StatusBadge tone={data.enabled ? 'success' : 'warning'} size="sm" dot>
              {data.enabled ? t('profile.twoFactorOn') : t('profile.twoFactorOff')}
            </StatusBadge>
          </div>
          <CardDescription className="mt-1">
            {data.enabled && data.enabledAt
              ? t('profile.twoFactorOnSince', { date: formatDate(data.enabledAt, 'dateShort') })
              : t('profile.twoFactorPitch')}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!data.enabled && requiring.length > 0 ? (
          <Alert variant="error" title={t('profile.requiredByTitle')}>
            {t('profile.requiredByBody', { churches: requiring.join(', ') })}
          </Alert>
        ) : null}
        {data.enabled ? (
          <>
            <div
              data-tone={low ? 'warning' : 'neutral'}
              className="flex items-center gap-3 rounded-xl bg-tone-soft/60 px-3.5 py-3"
            >
              {low ? (
                <TriangleAlert className="size-4 shrink-0 text-tone-ink" aria-hidden />
              ) : (
                <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <p className="min-w-0 flex-1 text-sm">
                {t('profile.recoveryRemaining', { count: data.recoveryCodesRemaining })}
                {low ? ` ${t('profile.recoveryLow')}` : ''}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => openConfirm('regenerate')}>
                <RefreshCw />
                {t('profile.regenerateAction')}
              </Button>
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => openConfirm('disable')}
              >
                <ShieldOff />
                {t('profile.disableAction')}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ul className="flex-1 space-y-1 text-sm text-muted-foreground">
              <li>{t('profile.twoFactorApps')}</li>
            </ul>
            <Button onClick={() => setSetupOpen(true)}>
              <Smartphone />
              {t('profile.twoFactorSetup')}
            </Button>
          </div>
        )}
      </CardContent>
      <SetupDialog open={setupOpen} onOpenChange={setSetupOpen} onDone={onSetupDone} />
      <ConfirmFactorDialog open={confirmOpen} kind={confirm} onOpenChange={setConfirmOpen} />
    </Card>
  );
}
