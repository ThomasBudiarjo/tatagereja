import type { Locale } from '@tatagereja/shared';
import { ChevronRight, LogOut, Monitor, Moon, Repeat, Sun } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { ModuleTiles } from '@/components/layout/module-tiles';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Segmented } from '@/components/ui/misc';
import { useLogout } from '@/features/auth/api';
import { useModuleMenu } from '@/features/registry';
import { useI18n } from '@/lib/i18n';
import { LANGUAGE_NAMES, ROLE_KEYS, useChangeLanguage } from '@/lib/i18n/labels';
import { useAuth } from '@/stores/auth';
import { useUiStore, type ThemePreference } from '@/stores/ui';

/** Every module the caller may open, as tiles by section, plus account shortcuts. */
export function MenuPage() {
  const { t, locale } = useI18n();
  const { church, access } = useChurch();
  const { user } = useAuth();
  const { sections } = useModuleMenu();
  const logout = useLogout();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const changeLanguage = useChangeLanguage();

  return (
    <Page size="wide">
      <PageHeader
        title={t('core.moreTitle')}
        description={t('common.menuDescription', { church: church.name })}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/profile"
          className="pressable flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <EntityAvatar name={user?.name ?? '?'} src={user?.avatarUrl} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{user?.name}</span>
            <span className="block truncate text-sm text-muted-foreground">{user?.email}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground/60" aria-hidden />
        </Link>
        <Link
          to="/churches"
          className="pressable flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <EntityAvatar
            name={church.name}
            src={church.logoUrl}
            color={church.brandColor}
            size="lg"
            square
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{church.name}</span>
            <span className="block truncate text-sm text-muted-foreground">
              {t(ROLE_KEYS[access.role])} · {t('core.openChurchSwitcher')}
            </span>
          </span>
          <Repeat className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      </div>

      {sections.map((section) => (
        <Section key={section.id} title={t(section.labelKey)}>
          <ModuleTiles items={section.items} />
        </Section>
      ))}

      <Section title={t('core.accountSection')}>
        <Card>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t('common.language')}</p>
              <Segmented<Locale>
                aria-label={t('common.language')}
                value={locale}
                onChange={(value) => {
                  if (value !== locale) changeLanguage(value);
                }}
                options={(Object.keys(LANGUAGE_NAMES) as Locale[]).map((value) => ({
                  value,
                  label: LANGUAGE_NAMES[value],
                }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t('common.theme')}</p>
              <Segmented<ThemePreference>
                aria-label={t('common.theme')}
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'system', label: t('common.themeSystem'), icon: Monitor },
                  { value: 'light', label: t('common.themeLight'), icon: Sun },
                  { value: 'dark', label: t('common.themeDark'), icon: Moon },
                ]}
              />
            </div>
          </CardContent>
        </Card>
      </Section>

      <Button variant="outline" onClick={() => logout.mutate()} loading={logout.isPending}>
        {!logout.isPending ? <LogOut /> : null}
        {t('common.signOut')}
      </Button>
      <p className="pb-2 text-center text-xs text-muted-foreground">{t('common.poweredBy')}</p>
    </Page>
  );
}
