import { registerBodySchema, type RegisterBody } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { publicInvitationQuery } from '@/features/invitations/api';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useServerStore } from '@/stores/server';
import { AuthLayout } from './auth-layout';
import { useRegister } from './api';
import { TurnstileWidget } from './turnstile';

type FormInput = z.input<typeof registerBodySchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite') ?? undefined;
  const register = useRegister();
  const currentUrl = useServerStore((state) => state.currentUrl);
  const server = useServerStore((state) => state.servers[currentUrl]);
  const invitation = useQuery({
    ...publicInvitationQuery(inviteToken ?? ''),
    enabled: !!inviteToken,
  });

  const form = useForm<FormInput, unknown, RegisterBody>({
    resolver: zodResolver(registerBodySchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      invitationToken: inviteToken,
      turnstileToken: undefined,
    },
  });

  const registrationMode = server?.registrationMode ?? 'public';
  const blocked =
    registrationMode === 'disabled' || (registrationMode === 'invite_only' && !inviteToken);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const response = await register.mutateAsync(values);
      navigate(response.joinedChurchId ? `/c/${response.joinedChurchId}` : '/churches', {
        replace: true,
      });
    } catch (error) {
      if (
        !applyServerErrors(error, form.setError, [
          'name',
          'email',
          'password',
          'invitationToken',
          'turnstileToken',
        ])
      ) {
        form.setError('root', { message: getErrorMessage(error) });
      }
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      description={
        invitation.data
          ? `You have been invited to join ${invitation.data.church.name}.`
          : 'One account lets you create a church or join one with an invitation.'
      }
    >
      {blocked ? (
        <Alert
          variant="warning"
          title={
            registrationMode === 'disabled' ? 'Registration is disabled' : 'Invitation required'
          }
        >
          {registrationMode === 'disabled'
            ? 'This server does not allow creating new accounts. Contact your church administrator.'
            : 'This server only accepts registrations through an invitation link or QR code from a church administrator.'}
        </Alert>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
          {form.formState.errors.root ? (
            <Alert variant="error">{form.formState.errors.root.message}</Alert>
          ) : null}
          {form.formState.errors.invitationToken ? (
            <Alert variant="error">{form.formState.errors.invitationToken.message}</Alert>
          ) : null}
          <Field
            label="Full name"
            htmlFor="name"
            error={form.formState.errors.name?.message}
            required
          >
            <Input
              id="name"
              autoComplete="name"
              {...form.register('name')}
              aria-invalid={!!form.formState.errors.name}
            />
          </Field>
          <Field
            label="Email"
            htmlFor="email"
            error={form.formState.errors.email?.message}
            required
          >
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
            description="At least 8 characters."
            required
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...form.register('password')}
              aria-invalid={!!form.formState.errors.password}
            />
          </Field>
          {server?.turnstileSiteKey ? (
            <Field error={form.formState.errors.turnstileToken?.message}>
              <TurnstileWidget
                siteKey={server.turnstileSiteKey}
                onToken={(token) => form.setValue('turnstileToken', token ?? undefined)}
              />
            </Field>
          ) : null}
          <FormActions className="sm:flex-col">
            <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
              Create account
            </Button>
          </FormActions>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          to={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : '/login'}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
