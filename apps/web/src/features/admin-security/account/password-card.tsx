import { securePasswordChangeBodySchema, type SecurePasswordChangeBody } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FormActions } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { ToneIcon } from '@/components/ui/status-badge';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { useSecurePasswordChange } from '../api';
import { PasswordStrengthMeter } from './password-strength';

type FormInput = z.input<typeof securePasswordChangeBodySchema>;

/** Changing the password, with a strength meter; every other device is signed out. */
export function PasswordCard() {
  const { t } = useI18n();
  const change = useSecurePasswordChange();
  const form = useForm<FormInput, unknown, SecurePasswordChangeBody>({
    resolver: zodResolver(securePasswordChangeBodySchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting);
  const newPassword = useWatch({ control: form.control, name: 'newPassword' });

  const submit = form.handleSubmit(async (values) => {
    if (change.isPending) return;
    try {
      const result = await change.mutateAsync(values);
      form.reset();
      toast.success(
        result.revokedSessions > 0
          ? t('profile.passwordChangedRevoked', { count: result.revokedSessions })
          : t('profile.passwordChangedKept'),
      );
    } catch (error) {
      if (isApiClientError(error) && error.status === 401) {
        form.setError(
          'currentPassword',
          { message: t('profile.currentPasswordWrong') },
          { shouldFocus: true },
        );
      } else if (!applyServerErrors(error, form.setError, ['currentPassword', 'newPassword'])) {
        toast.error(getErrorMessage(error));
      }
    }
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <ToneIcon icon={KeyRound} tone="amber" />
        <div className="min-w-0 flex-1">
          <CardTitle>{t('profile.password')}</CardTitle>
          <CardDescription className="mt-1">{t('profile.passwordDescriptionNew')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
          <Field
            label={t('profile.currentPassword')}
            htmlFor="current-password"
            error={errors.currentPassword?.message}
            required
          >
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              aria-invalid={!!errors.currentPassword}
              {...form.register('currentPassword')}
            />
          </Field>
          <Field
            label={t('profile.newPassword')}
            htmlFor="new-password"
            error={errors.newPassword?.message}
            required
          >
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              aria-describedby="new-password-strength"
              {...form.register('newPassword')}
            />
          </Field>
          <PasswordStrengthMeter password={newPassword ?? ''} id="new-password-strength" />
          <Alert variant="info">{t('profile.revokeOthersNote')}</Alert>
          <FormActions>
            <Button type="submit" loading={change.isPending} disabled={!isDirty}>
              {t('profile.changePassword')}
            </Button>
          </FormActions>
          {guard}
        </form>
      </CardContent>
    </Card>
  );
}
