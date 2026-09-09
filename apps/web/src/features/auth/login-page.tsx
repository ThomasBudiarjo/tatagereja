import { loginBodySchema, type LoginBody } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { useAcceptInvitation } from '@/features/invitations/api';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useServerStore } from '@/stores/server';
import { AuthLayout } from './auth-layout';
import { useLogin } from './api';

type FormInput = z.input<typeof loginBodySchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite');
  const login = useLogin();
  const accept = useAcceptInvitation();
  const currentUrl = useServerStore((state) => state.currentUrl);
  const server = useServerStore((state) => state.servers[currentUrl]);
  const registrationDisabled = server?.registrationMode === 'disabled';

  const form = useForm<FormInput, unknown, LoginBody>({
    resolver: zodResolver(loginBodySchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      if (inviteToken) {
        try {
          const result = await accept.mutateAsync(inviteToken);
          navigate(`/c/${result.churchId}`, { replace: true });
          return;
        } catch (error) {
          toast.error(getErrorMessage(error, 'Could not join the church'));
        }
      }
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/welcome' ? from : '/', { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['email', 'password'])) {
        form.setError('root', { message: getErrorMessage(error) });
      }
    }
  });

  return (
    <AuthLayout
      title="Log in"
      description={inviteToken ? 'Log in to accept your church invitation.' : 'Welcome back.'}
    >
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
        {form.formState.errors.root ? (
          <Alert variant="error">{form.formState.errors.root.message}</Alert>
        ) : null}
        <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            {...form.register('email')}
            aria-invalid={!!form.formState.errors.email}
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          error={form.formState.errors.password?.message}
          required
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
            aria-invalid={!!form.formState.errors.password}
          />
        </Field>
        <FormActions className="sm:flex-col">
          <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
            Log in
          </Button>
        </FormActions>
      </form>
      {!registrationDisabled ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link
            to={inviteToken ? `/register?invite=${encodeURIComponent(inviteToken)}` : '/register'}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Registration is disabled on this server.
        </p>
      )}
    </AuthLayout>
  );
}
