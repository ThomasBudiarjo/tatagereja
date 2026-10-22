import { useQuery } from '@tanstack/react-query';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type * as React from 'react';
import { Link, useMatch, useResolvedPath } from 'react-router';
import { Tooltip } from '@/components/ui/tooltip';
import { useModuleMenu, type MenuItem } from '@/features/registry';
import { useI18n } from '@/lib/i18n';
import type { ModuleContext } from '@/lib/modules';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { ChurchSwitcher } from './church-switcher';
import { UserMenu } from './user-menu';

function NavBadge({ item, context }: { item: MenuItem; context: ModuleContext }) {
  // `badge` is only set on some items; the query is skipped for the rest.
  const options = item.badge?.(context);
  const query = useQuery({
    queryKey: options?.queryKey ?? ['nav-badge', item.moduleId, item.id],
    queryFn: options?.queryFn ?? (() => Promise.resolve(0)),
    enabled: !!options,
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? 60_000,
  });
  if (!query.data) return null;
  return (
    <span className="ml-auto min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] leading-5 font-semibold text-primary-foreground tabular">
      {query.data > 99 ? '99+' : query.data}
    </span>
  );
}

/**
 * One menu entry. It computes its active state itself and renders a plain link, so a tooltip
 * trigger can wrap it (`Slot` cannot merge NavLink's function class names).
 */
function SidebarLink({
  item,
  collapsed,
  context,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Link>, 'to'> & {
  item: MenuItem;
  collapsed: boolean;
  context: ModuleContext;
}) {
  const { t } = useI18n();
  const resolved = useResolvedPath(item.href);
  const isActive = !!useMatch({ path: resolved.pathname, end: !!item.end });
  return (
    <Link
      {...props}
      to={item.href}
      aria-current={isActive ? 'page' : undefined}
      aria-label={collapsed ? t(item.labelKey) : undefined}
      className={cn(
        'group flex h-10 items-center gap-3 rounded-lg text-sm font-medium transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        collapsed ? 'mx-auto w-11 justify-center' : 'px-2.5',
        isActive
          ? 'bg-card text-foreground shadow-xs ring-1 ring-border/70'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
        className,
      )}
    >
      <span
        data-tone={item.tone}
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
          isActive
            ? 'bg-tone-soft text-tone-ink'
            : 'text-muted-foreground group-hover:text-foreground',
        )}
      >
        <item.icon className="size-[18px]" />
      </span>
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span> : null}
      {!collapsed && item.badge ? <NavBadge item={item} context={context} /> : null}
    </Link>
  );
}

/** Desktop navigation: church switcher, the module menu by section and the account. */
export function Sidebar() {
  const { t } = useI18n();
  const { sections, context } = useModuleMenu();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const collapsedSections = useUiStore((state) => state.collapsedSections);
  const toggleSection = useUiStore((state) => state.toggleSection);

  return (
    <aside
      data-print="hide"
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 ease-out-soft md:flex',
        collapsed ? 'w-[76px]' : 'w-64 lg:w-[17rem]',
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-border/70 px-3',
          collapsed && 'justify-center',
        )}
      >
        <ChurchSwitcher collapsed={collapsed} />
      </div>

      <nav
        aria-label={t('common.primaryNavigation')}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pt-4 pb-4"
      >
        {sections.map((section) => {
          const folded = !collapsed && collapsedSections.includes(section.id);
          const listId = `nav-section-${section.id}`;
          return (
            <div key={section.id} className="flex flex-col gap-0.5">
              {collapsed ? (
                <div className="mx-auto mb-1 h-px w-6 bg-border first:hidden" aria-hidden />
              ) : (
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={!folded}
                  aria-controls={listId}
                  className="group flex h-7 items-center justify-between rounded-md px-2.5 text-overline text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t(section.labelKey)}
                  <ChevronDown
                    className={cn(
                      'size-3.5 opacity-0 transition-all group-hover:opacity-100 group-focus-visible:opacity-100',
                      folded && '-rotate-90 opacity-100',
                    )}
                    aria-hidden
                  />
                </button>
              )}
              <div
                id={listId}
                className={cn(
                  'grid transition-[grid-template-rows,opacity] duration-200 ease-out-soft',
                  folded ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
                )}
                inert={folded}
              >
                <ul className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                  {section.items.map((item) => (
                    <li key={`${item.moduleId}-${item.id}`}>
                      <Tooltip content={t(item.labelKey)} side="right" disabled={!collapsed}>
                        <SidebarLink item={item} collapsed={collapsed} context={context} />
                      </Tooltip>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </nav>

      <div className={cn('flex flex-col gap-1 border-t p-3', collapsed && 'items-center')}>
        <UserMenu variant="row" collapsed={collapsed} />
        <Tooltip
          content={collapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
          side="right"
        >
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
            className={cn(
              'flex h-9 items-center gap-2 rounded-lg text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              collapsed ? 'w-11 justify-center' : 'px-2.5',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
            {!collapsed ? t('common.collapseSidebar') : null}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
