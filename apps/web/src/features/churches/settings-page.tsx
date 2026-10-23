import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { SECTION_GROUPS, useSettingsSections } from '@/features/admin-security/settings/sections';
import { useI18n } from '@/lib/i18n';
import { ROLE_KEYS } from '@/lib/i18n/labels';

/**
 * Church settings home: the church at a glance and every settings section the caller may
 * open, as a list on phones and cards from `sm`. Each section has its own page and URL.
 */
export function ChurchSettingsPage() {
  const { t } = useI18n();
  const { church, base, access, memberCount } = useChurch();
  const sections = useSettingsSections();

  return (
    <Page size="wide">
      <PageHeader
        backTo={`${base}/more`}
        title={t('admin-security.settingsTitle')}
        description={t('admin-security.settingsDescription')}
      />

      <div className="flex animate-rise-in items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-soft sm:p-5">
        <EntityAvatar
          name={church.name}
          src={church.logoUrl}
          color={church.brandColor}
          size="lg"
          square
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold tracking-tight">{church.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {[church.city, t('admin-security.accountsCount', { count: memberCount })]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <StatusBadge tone={access.role === 'member' ? 'neutral' : 'brand'}>
          {t(ROLE_KEYS[access.role])}
        </StatusBadge>
      </div>

      {SECTION_GROUPS.map((group) => {
        const items = sections.filter((section) => section.group === group.id);
        if (items.length === 0) return null;
        return (
          <Section key={group.id} title={t(group.labelKey)}>
            <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((section, index) => (
                <li
                  key={section.id}
                  className="animate-rise-in"
                  style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
                >
                  <Link
                    to={`${base}/settings/${section.id}`}
                    className="pressable group flex h-full min-h-16 items-center gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-soft outline-none hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:items-start sm:p-4"
                  >
                    <ToneIcon icon={section.icon} tone={section.tone} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold tracking-tight">
                        {t(section.labelKey)}
                      </span>
                      <span className="line-clamp-2 block text-sm text-muted-foreground">
                        {t(section.descriptionKey)}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 self-center text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        );
      })}
    </Page>
  );
}
