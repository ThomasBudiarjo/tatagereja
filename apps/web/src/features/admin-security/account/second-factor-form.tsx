import { KeyRound, Smartphone } from 'lucide-react';
import { Controller, useWatch } from 'react-hook-form';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { OtpInput } from '../components/otp-input';
import type { useSecondFactorForm } from './second-factor';

export function SecondFactorFields({
  form,
  idPrefix,
  passwordRequired = true,
}: {
  form: ReturnType<typeof useSecondFactorForm>;
  idPrefix: string;
  passwordRequired?: boolean;
}) {
  const { t } = useI18n();
  const method = useWatch({ control: form.control, name: 'method' });
  const { errors } = form.formState;
  return (
    <div className="flex flex-col gap-4">
      {passwordRequired ? (
        <Field
          label={t('profile.currentPassword')}
          htmlFor={`${idPrefix}-password`}
          error={errors.password?.message}
          required
        >
          <PasswordInput
            id={`${idPrefix}-password`}
            autoComplete="current-password"
            autoFocus
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
        </Field>
      ) : null}
      {method === 'totp' ? (
        <Field
          label={t('profile.authenticatorCode')}
          htmlFor={`${idPrefix}-code`}
          error={errors.code?.message}
          required
        >
          <Controller
            control={form.control}
            name="code"
            render={({ field }) => (
              <OtpInput
                id={`${idPrefix}-code`}
                value={field.value}
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
          htmlFor={`${idPrefix}-recovery`}
          error={errors.recoveryCode?.message}
          required
        >
          <Controller
            control={form.control}
            name="recoveryCode"
            render={({ field }) => (
              <OtpInput
                id={`${idPrefix}-recovery`}
                mode="recovery"
                value={field.value}
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
        size="sm"
        className="h-auto self-start px-0"
        onClick={() => {
          form.setValue('method', method === 'totp' ? 'recovery' : 'totp');
          form.clearErrors(['code', 'recoveryCode']);
        }}
      >
        {method === 'totp' ? <KeyRound /> : <Smartphone />}
        {method === 'totp' ? t('profile.useRecoveryInstead') : t('profile.useAppInstead')}
      </Button>
    </div>
  );
}

export function SecondFactorActions({
  onCancel,
  submitLabel,
  pending,
  variant,
  disabled = false,
}: {
  onCancel: () => void;
  submitLabel: string;
  pending: boolean;
  variant?: ButtonProps['variant'];
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <FormActions className="pt-0">
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" variant={variant} loading={pending} disabled={disabled}>
        {submitLabel}
      </Button>
    </FormActions>
  );
}
