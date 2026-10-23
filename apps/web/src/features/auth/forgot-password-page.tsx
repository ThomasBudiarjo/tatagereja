import {
  recoveryPasswordResetBodySchema,
  type RecoveryPasswordResetBody,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Users } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input, PasswordInput } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { ToneIcon } from '@/components/ui/status-badge';
import { PasswordStrengthMeter } from '@/features/admin-security/account/password-strength';
import { OtpInput } from '@/features/admin-security/components/otp-input';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { AuthLayout } from './auth-layout';
import { useRecoveryPasswordReset } from './api';

type FormInput = z.input<typeof recoveryPasswordResetBodySchema>;

/**
 * There is no email: a forgotten password is reset with a link from the church (made by an
 * administrator) or, for accounts with two-step verification, with a saved recovery code.
 */
export function ForgotPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const reset = useRecoveryPasswordReset();
  const form = useForm<FormInput, unknown, RecoveryPasswordResetBody>({
    resolver: zodResolver(recoveryPasswordResetBodySchema),
    defaultValues: { email: '', recoveryCode: '', newPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const newPassword = useWatch({ control: form.control, name: 'newPassword' });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await reset.mutateAsync(values);
      toast.success(t('auth.resetDone'));
      navigate('/login', { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['email', 'recoveryCode', 'newPassword'])) {
        form.setError('root', { message: getErrorMessage(error) });
      }
    }
  });

  return (
    <AuthLayout title={t('auth.forgotTitle')} description={t('auth.forgotDescription')}>
      <div className="flex flex-col gap-6">
        <section className="flex gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-xs">
          <ToneIcon icon={Users} tone="sky" />
          <div className="min-w-0">
            <h2 className="font-semibold">{t('auth.forgotAskTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('auth.forgotAskBody')}</p>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-xs">
          <div className="flex gap-3">
            <ToneIcon icon={KeyRound} tone="amber" />
            <div className="min-w-0">
              <h2 className="font-semibold">{t('auth.forgotRecoveryTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('auth.forgotRecoveryBody')}</p>
            </div>
          </div>
          <form
            onSubmit={(event) => void onSubmit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}
            <Field
              label={t('auth.email')}
              htmlFor="reset-email"
              error={errors.email?.message}
              required
            >
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                aria-invalid={!!errors.email}
                {...form.register('email')}
              />
            </Field>
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
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={!!errors.recoveryCode}
                  />
                )}
              />
            </Field>
            <Field
              label={t('auth.newPassword')}
              htmlFor="reset-new-password"
              error={errors.newPassword?.message}
              required
            >
              <PasswordInput
                id="reset-new-password"
                autoComplete="new-password"
                aria-invalid={!!errors.newPassword}
                aria-describedby="reset-new-password-strength"
                {...form.register('newPassword')}
              />
            </Field>
            <PasswordStrengthMeter password={newPassword ?? ''} id="reset-new-password-strength" />
            <FormActions className="sm:flex-col">
              <Button type="submit" size="lg" loading={isSubmitting}>
                {t('auth.resetSubmit')}
              </Button>
            </FormActions>
          </form>
        </section>

        <p className="text-center text-sm">
          <Link
            to="/login"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t('auth.backToLogin')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
