import { HandHeart, LayoutGrid } from 'lucide-react';
import type * as React from 'react';
import { Link, useLocation } from 'react-router';
import { useModuleMenu } from '@/features/registry';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Tab = {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
};

const startsWith = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * Phone navigation: Home, People, Events, the Ministry hub and the Menu. Slots whose module
 * the caller cannot see are left out, so the bar never links to a "no access" page.
 */
export function BottomNav() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { tabs, sections, context } = useModuleMenu();
  const ministryItems = sections.find((section) => section.id === 'ministry')?.items ?? [];
  const fixed = [tabs.home, tabs.people, tabs.events].filter((item) => !!item);
  const fixedHrefs = fixed.map((item) => item.href);

  const list: Tab[] = [
    ...fixed.map((item) => ({
      id: item.id,
      href: item.href,
      label: t(item.labelKey),
      icon: item.icon,
      active: item.end ? pathname === item.href : startsWith(pathname, item.href),
    })),
    {
      id: 'ministry',
      href: `${context.base}/ministry`,
      label: t('common.ministryHub'),
      icon: HandHeart,
      active:
        startsWith(pathname, `${context.base}/ministry`) ||
        ministryItems.some((item) => startsWith(pathname, item.href)),
    },
  ];
  const anyActive = list.some((tab) => tab.active);
  list.push({
    id: 'more',
    href: `${context.base}/more`,
    label: t('common.menu'),
    icon: LayoutGrid,
    // Everything not covered by another tab lives under the menu.
    active:
      startsWith(pathname, `${context.base}/more`) ||
      (!anyActive && !fixedHrefs.includes(pathname)),
  });

  return (
    <nav
      data-print="hide"
      aria-label={t('common.primaryNavigation')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-card/90 backdrop-blur-lg safe-bottom md:hidden"
    >
      <ul
        className="mx-auto grid h-16 max-w-lg"
        style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}
      >
        {list.map((tab) => (
          <li key={tab.id} className="flex">
            <Link
              to={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors outline-none focus-visible:text-foreground',
                tab.active ? 'text-primary' : 'text-muted-foreground active:text-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-14 items-center justify-center rounded-full transition-all duration-200 ease-out-soft',
                  tab.active ? 'scale-100 bg-accent' : 'scale-90',
                )}
              >
                <tab.icon
                  className={cn('size-5 transition-transform', tab.active && 'scale-105')}
                />
              </span>
              <span className="max-w-full truncate px-1">{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
