import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, type Breadcrumb } from '@/components/layout/page';
import { useI18n } from '@/lib/i18n';
import {
  SECTION_GROUPS,
  SETTINGS_SECTIONS,
  useSettingsSections,
  type SettingsSectionId,
} from './sections';
import { cn } from '@/lib/utils';

/** Desktop navigation between settings sections. */
export function SettingsNav({ active }: { active?: SettingsSectionId }) {
  const { t } = useI18n();
  const { base } = useChurch();
  const sections = useSettingsSections();
  return (
    <nav aria-label={t('admin-security.settingsNav')} className="flex flex-col gap-4">
      {SECTION_GROUPS.map((group) => {
        const items = sections.filter((section) => section.group === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="flex flex-col gap-0.5">
            <p className="text-overline px-3 pb-1 text-muted-foreground">{t(group.labelKey)}</p>
            {items.map((section) => (
              <NavLink
                key={section.id}
                to={`${base}/settings/${section.id}`}
                aria-current={active === section.id ? 'page' : undefined}
                className={cn(
                  'group flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30',
                  active === section.id &&
                    'bg-card text-foreground shadow-xs ring-1 ring-border/70',
                )}
              >
                <span
                  data-tone={section.tone}
                  className={cn(
                    'flex size-7 items-center justify-center rounded-md transition-colors',
                    active === section.id
                      ? 'bg-tone-soft text-tone-ink'
                      : 'text-muted-foreground group-hover:text-foreground',
                  )}
                  aria-hidden
                >
                  <section.icon className="size-4" />
                </span>
                <span className="truncate">{t(section.labelKey)}</span>
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Frame of a settings section: the section navigation beside the content from `lg`, a back
 * link to the settings list on smaller screens, breadcrumbs and the page title.
 */
export function SettingsPage({
  section,
  title,
  description,
  actions,
  breadcrumbs = [],
  children,
}: {
  section: SettingsSectionId;
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Extra trail after the section (detail pages). */
  breadcrumbs?: Breadcrumb[];
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { base } = useChurch();
  const definition = SETTINGS_SECTIONS.find((item) => item.id === section);
  const sectionLabel = definition ? t(definition.labelKey) : '';
  const sectionUrl = `${base}/settings/${section}`;
  const trail: Breadcrumb[] = [
    { label: t('admin-security.settingsTitle'), to: `${base}/settings` },
    { label: sectionLabel, to: breadcrumbs.length > 0 ? sectionUrl : undefined },
    ...breadcrumbs,
  ];
  return (
    <Page size="wide">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <SettingsNav active={section} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
          <PageHeader
            title={title ?? sectionLabel}
            description={description}
            breadcrumbs={trail}
            backTo={breadcrumbs.length > 0 ? sectionUrl : `${base}/settings`}
            icon={breadcrumbs.length === 0 ? definition?.icon : undefined}
            tone={definition?.tone}
            actions={actions}
          />
          {children}
        </div>
      </div>
    </Page>
  );
}
