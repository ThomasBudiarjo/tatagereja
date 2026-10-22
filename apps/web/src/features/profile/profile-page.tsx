import {
  changePasswordBodySchema,
  updateProfileBodySchema,
  type ChangePasswordBody,
  type UpdateProfileBody,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { Locale } from '@tatagereja/shared';
import { LogOut, Monitor, Moon, Smartphone, Sun } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FormActions } from '@/components/ui/field';
import { Input, PasswordInput } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/ui/list';
import { ErrorState, Segmented } from '@/components/ui/misc';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  sessionsQuery,
  useChangePassword,
  useLogout,
  useRevokeSession,
  useUpdateProfile,
} from '@/features/auth/api';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { LANGUAGE_NAMES, useChangeLanguage } from '@/lib/i18n/labels';
import { hostLabel } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { useServerStore, isDefaultServer, DEFAULT_SERVER_NAME } from '@/stores/server';
import { useUiStore, type ThemePreference } from '@/stores/ui';

type ProfileInput = z.input<typeof updateProfileBodySchema>;
type PasswordInput = z.input<typeof changePasswordBodySchema>;

function ProfileForm() {
  const { t } = useI18n();
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
      form.reset(form.getValues());
      toast.success(t('profile.profileUpdated'));
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
          <p className="text-muted-foreground">{t('profile.emailLocked')}</p>
        </div>
      </div>
      <Field label={t('profile.name')} htmlFor="profile-name" error={errors.name?.message} required>
        <Input
          id="profile-name"
          autoComplete="name"
          {...form.register('name')}
          aria-invalid={!!errors.name}
        />
      </Field>
      <Field
        label={t('profile.avatarUrl')}
        htmlFor="profile-avatar"
        error={errors.avatarUrl?.message}
        description={t('profile.avatarHint')}
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
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          disabled={!form.formState.isDirty}
        >
          {t('common.saveChanges')}
        </Button>
      </FormActions>
    </form>
  );
}

function PasswordForm() {
  const { t } = useI18n();
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
      toast.success(t('profile.passwordChanged'));
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['currentPassword', 'newPassword'])) {
        form.setError('currentPassword', { message: getErrorMessage(error) });
      }
    }
  });
  return (
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
          {...form.register('currentPassword')}
          aria-invalid={!!errors.currentPassword}
        />
      </Field>
      <Field
        label={t('profile.newPassword')}
        htmlFor="new-password"
        error={errors.newPassword?.message}
        description={t('profile.passwordHint')}
        required
      >
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          {...form.register('newPassword')}
          aria-invalid={!!errors.newPassword}
        />
      </Field>
      <FormActions>
        <Button type="submit" variant="outline" loading={form.formState.isSubmitting}>
          {t('profile.changePassword')}
        </Button>
      </FormActions>
    </form>
  );
}

function SessionsList() {
  const { t, formatRelative } = useI18n();
  const sessions = useQuery(sessionsQuery());
  const revoke = useRevokeSession();
  if (sessions.isPending) return <SkeletonList rows={2} avatar={false} />;
  if (sessions.isError)
    return (
      <ErrorState
        compact
        error={sessions.error}
        message={getErrorMessage(sessions.error)}
        onRetry={() => void sessions.refetch()}
        retrying={sessions.isFetching}
      />
    );
  return (
    <ListGroup>
      {sessions.data.items.map((session) => (
        <ListRow
          key={session.id}
          leading={<Smartphone className="size-5 text-muted-foreground" />}
          title={
            <span className="flex items-center gap-2">
              <span className="truncate">
                {session.userAgent ? session.userAgent.split(' ')[0] : t('profile.unknownDevice')}
              </span>
              {session.current ? (
                <StatusBadge tone="success" dot size="sm">
                  {t('profile.thisDevice')}
                </StatusBadge>
              ) : null}
            </span>
          }
          subtitle={t('profile.sessionMeta', {
            lastActive: formatRelative(session.lastUsedAt),
            expires: formatRelative(session.expiresAt),
          })}
          trailing={
            !session.current ? (
              <Button
                variant="ghost"
                size="sm"
                loading={revoke.isPending && revoke.variables === session.id}
                disabled={revoke.isPending}
                onClick={async () => {
                  try {
                    await revoke.mutateAsync(session.id);
                    toast.success(t('profile.sessionSignedOut'));
                  } catch (error) {
                    toast.error(getErrorMessage(error));
                  }
                }}
              >
                {t('profile.signOutSession')}
              </Button>
            ) : null
          }
        />
      ))}
    </ListGroup>
  );
}

export function ProfilePage() {
  const { t, locale } = useI18n();
  const logout = useLogout();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const changeLanguage = useChangeLanguage();
  const currentUrl = useServerStore((state) => state.currentUrl);
  const server = useServerStore((state) => state.servers[currentUrl]);
  const serverName =
    server?.name ?? (isDefaultServer(currentUrl) ? DEFAULT_SERVER_NAME : hostLabel(currentUrl));

  return (
    <Page>
      <PageHeader backTo="/" title={t('profile.title')} description={t('profile.description')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.profile')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.preferences')}</CardTitle>
          <CardDescription>{t('profile.preferencesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t('profile.language')}</p>
            <Segmented<Locale>
              aria-label={t('profile.language')}
              value={locale}
              onChange={(value) => {
                if (value !== locale) changeLanguage(value);
              }}
              options={(Object.keys(LANGUAGE_NAMES) as Locale[]).map((value) => ({
                value,
                label: LANGUAGE_NAMES[value],
              }))}
            />
            <p className="text-xs text-muted-foreground">{t('profile.languageHint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t('profile.appearance')}</p>
            <Segmented<ThemePreference>
              aria-label={t('profile.appearance')}
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: t('common.themeSystem'), icon: Monitor },
                { value: 'light', label: t('common.themeLight'), icon: Sun },
                { value: 'dark', label: t('common.themeDark'), icon: Moon },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {theme === 'system'
                ? t('profile.themeHintSystem')
                : theme === 'dark'
                  ? t('profile.themeHintDark')
                  : t('profile.themeHintLight')}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.password')}</CardTitle>
          <CardDescription>{t('profile.passwordDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
      <Section title={t('profile.sessions')} description={t('profile.sessionsDescription')}>
        <SessionsList />
      </Section>
      <Section title={t('profile.server')}>
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
        {!logout.isPending ? <LogOut /> : null}
        {t('common.signOut')}
      </Button>
    </Page>
  );
}
