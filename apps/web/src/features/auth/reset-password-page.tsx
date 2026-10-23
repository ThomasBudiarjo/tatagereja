import { completePasswordResetBodySchema } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, KeyRound, LinkIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/input';
import { Alert, EmptyState, ErrorState } from '@/components/ui/misc';
import { SkeletonText } from '@/components/ui/skeleton';
import { PasswordStrengthMeter } from '@/features/admin-security/account/password-strength';
import { OtpInput } from '@/features/admin-security/components/otp-input';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { AuthLayout } from './auth-layout';
import { passwordResetQuery, useCompletePasswordReset } from './api';

const formSchema = completePasswordResetBodySchema.omit({ token: true });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

/** `/reset-password/:token`: the one-time link an administrator made for this account. */
export function ResetPasswordPage() {
  const { t, formatDateTime } = useI18n();
  const { token = '' } = useParams();
  const preview = useQuery(passwordResetQuery(token));
  const complete = useCompletePasswordReset();
  const [method, setMethod] = useState<'totp' | 'recovery'>('totp');
  const [done, setDone] = useState(false);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { newPassword: '', code: undefined, recoveryCode: undefined },
  });
  const { errors, isSubmitting } = form.formState;
  const newPassword = useWatch({ control: form.control, name: 'newPassword' });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await complete.mutateAsync({
        token,
        newPassword: values.newPassword,
        ...(preview.data?.twoFactorRequired
          ? method === 'totp'
            ? { code: values.code ?? '' }
            : { recoveryCode: values.recoveryCode ?? '' }
          : {}),
      });
      setDone(true);
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['newPassword', 'code', 'recoveryCode'])) {
        form.setError('root', { message: getErrorMessage(error) });
      }
    }
  });

  if (done) {
    return (
      <AuthLayout title={t('auth.resetDoneTitle')} showServer={false}>
        <EmptyState
          icon={CircleCheck}
          tone="success"
          title={t('auth.resetDoneTitle')}
          description={t('auth.resetDoneBody')}
          action={
            <Button asChild size="lg">
              <Link to="/login" replace>
                {t('auth.login')}
              </Link>
            </Button>
          }
        />
      </AuthLayout>
    );
  }

  if (preview.isPending) {
    return (
      <AuthLayout title={t('auth.resetTitle')} showServer={false}>
        <SkeletonText lines={4} />
      </AuthLayout>
    );
  }

  if (preview.isError) {
    const gone = isApiClientError(preview.error) && preview.error.code === 'RESET_LINK_INVALID';
    return (
      <AuthLayout title={t('auth.resetInvalidTitle')} showServer={false}>
        {gone ? (
          <EmptyState
            icon={LinkIcon}
            tone="warning"
            title={t('auth.resetInvalidTitle')}
            description={t('auth.resetInvalidBody')}
            action={
              <Button asChild variant="outline">
                <Link to="/login">{t('auth.backToLogin')}</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            error={preview.error}
            message={getErrorMessage(preview.error)}
            onRetry={() => void preview.refetch()}
            retrying={preview.isFetching}
          />
        )}
      </AuthLayout>
    );
  }

  const { name, email, expiresAt, twoFactorRequired } = preview.data;
  return (
    <AuthLayout
      title={t('auth.resetTitle')}
      description={t('auth.resetDescription', { name, email, time: formatDateTime(expiresAt) })}
      showServer={false}
    >
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
        {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}
        <Field
          label={t('auth.newPassword')}
          htmlFor="new-password"
          error={errors.newPassword?.message}
          required
        >
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            autoFocus
            aria-invalid={!!errors.newPassword}
            aria-describedby="new-password-strength"
            {...form.register('newPassword')}
          />
        </Field>
        <PasswordStrengthMeter password={newPassword ?? ''} id="new-password-strength" />
        {twoFactorRequired ? (
          <>
            <Alert variant="info">{t('auth.resetTwoFactorHint')}</Alert>
            {method === 'totp' ? (
              <Field
                label={t('profile.authenticatorCode')}
                htmlFor="reset-code"
                error={errors.code?.message}
                required
              >
                <Controller
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <OtpInput
                      id="reset-code"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={!!errors.code}
                    />
                  )}
                />
              </Field>
            ) : (
              <Field
                label={t('profile.recoveryCode')}
                htmlFor="reset-recovery"
                error={errors.recoveryCode?.message}
                required
              >
                <Controller
                  control={form.control}
                  name="recoveryCode"
                  render={({ field }) => (
                    <OtpInput
                      id="reset-recovery"
                      mode="recovery"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={!!errors.recoveryCode}
                    />
                  )}
                />
              </Field>
            )}
            <Button
              type="button"
              variant="link"
              className="self-start px-0"
              onClick={() => {
                form.clearErrors(['code', 'recoveryCode']);
                form.setValue(method === 'totp' ? 'code' : 'recoveryCode', undefined);
                setMethod(method === 'totp' ? 'recovery' : 'totp');
              }}
            >
              <KeyRound />
              {method === 'totp' ? t('profile.useRecoveryInstead') : t('profile.useAppInstead')}
            </Button>
          </>
        ) : null}
        <FormActions className="sm:flex-col">
          <Button type="submit" size="lg" loading={isSubmitting}>
            {t('auth.resetSubmit')}
          </Button>
        </FormActions>
      </form>
    </AuthLayout>
  );
}
