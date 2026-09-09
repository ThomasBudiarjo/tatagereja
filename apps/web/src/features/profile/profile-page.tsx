import {
  changePasswordBodySchema,
  updateProfileBodySchema,
  type ChangePasswordBody,
  type UpdateProfileBody,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FormActions } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/ui/list';
import { Alert, PageLoader, Segmented } from '@/components/ui/misc';
import {
  sessionsQuery,
  useChangePassword,
  useLogout,
  useRevokeSession,
  useUpdateProfile,
} from '@/features/auth/api';
import { getErrorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { hostLabel } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { useServerStore, isDefaultServer, DEFAULT_SERVER_NAME } from '@/stores/server';
import { useUiStore, type ThemePreference } from '@/stores/ui';

type ProfileInput = z.input<typeof updateProfileBodySchema>;
type PasswordInput = z.input<typeof changePasswordBodySchema>;

function ProfileForm() {
  const { user } = useAuth();
  const update = useUpdateProfile();
  const form = useForm<ProfileInput, unknown, UpdateProfileBody>({
    resolver: zodResolver(updateProfileBodySchema),
    defaultValues: { name: user?.name ?? '', avatarUrl: user?.avatarUrl ?? '' },
  });
  const errors = form.formState.errors;
  const avatarUrl = useWatch({ control: form.control, name: 'avatarUrl' });
  const submit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      toast.success('Profile updated');
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['name', 'avatarUrl']))
        toast.error(getErrorMessage(error));
    }
  });
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      <div className="flex items-center gap-4">
        <EntityAvatar name={user?.name ?? '?'} src={avatarUrl || null} size="lg" />
        <div className="min-w-0 text-sm">
          <p className="truncate font-semibold">{user?.email}</p>
          <p className="text-muted-foreground">Your email cannot be changed here.</p>
        </div>
      </div>
      <Field label="Name" htmlFor="profile-name" error={errors.name?.message} required>
        <Input
          id="profile-name"
          autoComplete="name"
          {...form.register('name')}
          aria-invalid={!!errors.name}
        />
      </Field>
      <Field
        label="Avatar URL"
        htmlFor="profile-avatar"
        error={errors.avatarUrl?.message}
        description="Link to a photo, e.g. https://example.com/me.jpg"
      >
        <Input
          id="profile-avatar"
          type="url"
          inputMode="url"
          placeholder="https://"
          {...form.register('avatarUrl')}
          aria-invalid={!!errors.avatarUrl}
        />
      </Field>
      <FormActions>
        <Button type="submit" loading={form.formState.isSubmitting}>
          Save
        </Button>
      </FormActions>
    </form>
  );
}

function PasswordForm() {
  const change = useChangePassword();
  const form = useForm<PasswordInput, unknown, ChangePasswordBody>({
    resolver: zodResolver(changePasswordBodySchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    try {
      await change.mutateAsync(values);
      form.reset();
      toast.success('Password changed. Other devices were signed out.');
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['currentPassword', 'newPassword'])) {
        form.setError('currentPassword', { message: getErrorMessage(error) });
      }
    }
  });
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      <Field
        label="Current password"
        htmlFor="current-password"
        error={errors.currentPassword?.message}
        required
      >
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          {...form.register('currentPassword')}
          aria-invalid={!!errors.currentPassword}
        />
      </Field>
      <Field
        label="New password"
        htmlFor="new-password"
        error={errors.newPassword?.message}
        description="At least 8 characters."
        required
      >
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          {...form.register('newPassword')}
          aria-invalid={!!errors.newPassword}
        />
      </Field>
      <FormActions>
        <Button type="submit" variant="outline" loading={form.formState.isSubmitting}>
          Change password
        </Button>
      </FormActions>
    </form>
  );
}

function SessionsList() {
  const sessions = useQuery(sessionsQuery());
  const revoke = useRevokeSession();
  if (sessions.isPending) return <PageLoader />;
  if (sessions.isError) return <Alert variant="error">{getErrorMessage(sessions.error)}</Alert>;
  return (
    <ListGroup>
      {sessions.data.items.map((session) => (
        <ListRow
          key={session.id}
          title={
            <span className="flex items-center gap-2">
              {session.userAgent ? session.userAgent.split(' ')[0] : 'Unknown device'}
              {session.current ? <Badge variant="success">This device</Badge> : null}
            </span>
          }
          subtitle={`Last active ${formatRelative(session.lastUsedAt)} · expires ${formatRelative(session.expiresAt)}`}
          trailing={
            !session.current ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await revoke.mutateAsync(session.id);
                    toast.success('Session signed out');
                  } catch (error) {
                    toast.error(getErrorMessage(error));
                  }
                }}
              >
                Sign out
              </Button>
            ) : null
          }
        />
      ))}
    </ListGroup>
  );
}

export function ProfilePage() {
  const logout = useLogout();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const currentUrl = useServerStore((state) => state.currentUrl);
  const server = useServerStore((state) => state.servers[currentUrl]);
  const serverName =
    server?.name ?? (isDefaultServer(currentUrl) ? DEFAULT_SERVER_NAME : hostLabel(currentUrl));

  return (
    <Page>
      <PageHeader
        backTo="/churches"
        title="Account"
        description="Manage your profile, security and preferences."
      />
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how TataGereja looks on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <Segmented<ThemePreference>
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            {theme === 'system' ? (
              <Monitor className="size-3.5" />
            ) : theme === 'dark' ? (
              <Moon className="size-3.5" />
            ) : (
              <Sun className="size-3.5" />
            )}
            {theme === 'system'
              ? 'Follows your device setting'
              : `${theme === 'dark' ? 'Dark' : 'Light'} theme`}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing your password signs out every other device.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
      <Section title="Active sessions">
        <SessionsList />
      </Section>
      <Section title="Server">
        <Card>
          <CardContent className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold">{serverName}</p>
              <p className="truncate text-muted-foreground">{currentUrl}</p>
            </div>
            <Badge variant="muted">v{server?.version ?? '?'}</Badge>
          </CardContent>
        </Card>
      </Section>
      <Button variant="outline" onClick={() => logout.mutate()} loading={logout.isPending}>
        <LogOut /> Sign out
      </Button>
    </Page>
  );
}
