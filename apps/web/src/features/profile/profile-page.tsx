import { updateProfileBodySchema, type UpdateProfileBody } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Locale } from '@tatagereja/shared';
import {
  FileLock,
  History,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
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
import { Segmented } from '@/components/ui/misc';
import { TabsContent, TabsList, TabsTrigger, UrlTabs } from '@/components/ui/tabs';
import { LoginHistorySection, SessionsSection } from '@/features/admin-security/account/activity';
import { PasswordCard } from '@/features/admin-security/account/password-card';
import { PrivacySection } from '@/features/admin-security/account/privacy';
import { TwoFactorCard } from '@/features/admin-security/account/two-factor-card';
import { useLogout, useUpdateProfile } from '@/features/auth/api';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { LANGUAGE_NAMES, useChangeLanguage } from '@/lib/i18n/labels';
import { hostLabel } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { useServerStore, isDefaultServer, DEFAULT_SERVER_NAME } from '@/stores/server';
import { useUiStore, type ThemePreference } from '@/stores/ui';

type ProfileInput = z.input<typeof updateProfileBodySchema>;

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

const TABS = ['profile', 'security', 'activity', 'privacy'] as const;

/** Only in-app church paths are followed after setting up two-step verification. */
const safeReturn = (value: string | null) =>
  value && /^\/c\/[0-9a-f-]{36}(\/[\w/-]*)?$/i.test(value) ? value : null;

export function ProfilePage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const logout = useLogout();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const changeLanguage = useChangeLanguage();
  const currentUrl = useServerStore((state) => state.currentUrl);
  const server = useServerStore((state) => state.servers[currentUrl]);
  const serverName =
    server?.name ?? (isDefaultServer(currentUrl) ? DEFAULT_SERVER_NAME : hostLabel(currentUrl));
  const returnTo = safeReturn(params.get('returnTo'));

  return (
    <Page>
      <PageHeader backTo="/" title={t('profile.title')} description={t('profile.description')} />
      <div className="flex items-center gap-3">
        <EntityAvatar name={user?.name ?? '?'} src={user?.avatarUrl} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{user?.name}</p>
          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>
      <UrlTabs defaultValue="profile" values={TABS}>
        <TabsList>
          <TabsTrigger value="profile">
            <UserRound className="hidden sm:block" />
            <span>{t('profile.tabProfile')}</span>
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldCheck className="hidden sm:block" />
            <span>{t('profile.tabSecurity')}</span>
          </TabsTrigger>
          <TabsTrigger value="activity">
            <History className="hidden sm:block" />
            <span>{t('profile.tabActivity')}</span>
          </TabsTrigger>
          <TabsTrigger value="privacy">
            <FileLock className="hidden sm:block" />
            <span>{t('profile.tabPrivacy')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="flex flex-col gap-5">
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
        </TabsContent>

        <TabsContent value="security" className="flex flex-col gap-5">
          <TwoFactorCard
            autoStart={params.get('setup') === '1'}
            onSetupDone={() => {
              if (returnTo) navigate(returnTo, { replace: true });
            }}
          />
          <PasswordCard />
        </TabsContent>

        <TabsContent value="activity" className="flex flex-col gap-6">
          <SessionsSection />
          <LoginHistorySection />
        </TabsContent>

        <TabsContent value="privacy">
          <PrivacySection />
        </TabsContent>
      </UrlTabs>
    </Page>
  );
}
