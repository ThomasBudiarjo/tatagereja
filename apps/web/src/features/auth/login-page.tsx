import {
  isLoginChallenge,
  loginBodySchema,
  type LoginBody,
  type LoginChallenge,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input, PasswordInput } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { useAcceptInvitation } from '@/features/invitations/api';
import { useLoginWithChallenge } from '@/features/admin-security/api';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { applyServerErrors } from '@/lib/forms';
import { useServerStore } from '@/stores/server';
import { AuthLayout } from './auth-layout';
import { TwoFactorStep } from './two-factor-step';

type FormInput = z.input<typeof loginBodySchema>;

export function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite');
  const login = useLoginWithChallenge();
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const accept = useAcceptInvitation();
  const currentUrl = useServerStore((state) => state.currentUrl);
  const server = useServerStore((state) => state.servers[currentUrl]);
  const registrationDisabled = server?.registrationMode === 'disabled';

  const form = useForm<FormInput, unknown, LoginBody>({
    resolver: zodResolver(loginBodySchema),
    defaultValues: { email: '', password: '' },
  });

  const finish = async () => {
    if (inviteToken) {
      try {
        const result = await accept.mutateAsync(inviteToken);
        navigate(`/c/${result.churchId}`, { replace: true });
        return;
      } catch (error) {
        toast.error(getErrorMessage(error, t('auth.joinFailed')));
      }
    }
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== '/welcome' ? from : '/', { replace: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await login.mutateAsync(values);
      if (isLoginChallenge(result)) {
        setChallenge(result);
        return;
      }
      await finish();
    } catch (error) {
      if (isApiClientError(error) && error.code === 'ACCOUNT_LOCKED') {
        form.setError('root', { message: t('auth.accountLocked') });
      } else if (isApiClientError(error) && error.status === 401) {
        form.setError('root', { message: t('auth.invalidCredentials') });
      } else if (!applyServerErrors(error, form.setError, ['email', 'password'])) {
        form.setError('root', { message: getErrorMessage(error) });
      }
    }
  });

  if (challenge) {
    return (
      <AuthLayout title={t('auth.twoFactorTitle')} description={t('auth.twoFactorDescription')}>
        <TwoFactorStep
          challenge={challenge}
          onSignedIn={() => void finish()}
          onRestart={() => {
            setChallenge(null);
            form.resetField('password');
          }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.loginTitle')}
      description={inviteToken ? t('auth.loginInviteDescription') : t('auth.loginDescription')}
    >
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
        {form.formState.errors.root ? (
          <Alert variant="error">{form.formState.errors.root.message}</Alert>
        ) : null}
        <Field
          label={t('auth.email')}
          htmlFor="email"
          error={form.formState.errors.email?.message}
          required
        >
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            {...form.register('email')}
            aria-invalid={!!form.formState.errors.email}
          />
        </Field>
        <Field
          label={t('auth.password')}
          htmlFor="password"
          error={form.formState.errors.password?.message}
          required
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            {...form.register('password')}
            aria-invalid={!!form.formState.errors.password}
          />
        </Field>
        <FormActions className="sm:flex-col">
          <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
            {t('auth.login')}
          </Button>
        </FormActions>
      </form>
      {!registrationDisabled ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('auth.newHere')}{' '}
          <Link
            to={inviteToken ? `/register?invite=${encodeURIComponent(inviteToken)}` : '/register'}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t('auth.createAccount')}
          </Link>
        </p>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('auth.registrationDisabledShort')}
        </p>
      )}
    </AuthLayout>
  );
}
