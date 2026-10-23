import { localize, rolePreview, type ModuleId, type Permission } from '@tatagereja/shared';
import { ChevronDown, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';
import { useModuleLook } from './module-look';

function GroupHeader({
  module,
  label,
  count,
}: {
  module: ModuleId;
  label: string;
  count: ReactNode;
}) {
  const { icon: Icon, tone } = useModuleLook(module);
  return (
    <>
      <span
        data-tone={tone}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tone-soft text-tone-ink"
        aria-hidden
      >
        {Icon ? <Icon className="size-4" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
      {count}
    </>
  );
}

/**
 * "What this role can do": permissions grouped by module, each with its plain-language
 * description. `sources` adds where a permission comes from (base role, custom roles).
 */
export function PermissionSummary({
  permissions,
  sources,
  collapsible = true,
  empty,
}: {
  permissions: readonly Permission[];
  sources?: (permission: Permission) => string[];
  collapsible?: boolean;
  empty?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const groups = rolePreview(permissions);
  if (groups.length === 0) {
    return (
      <>
        {empty ?? (
          <p className="text-sm text-muted-foreground">{t('admin-security.noPermissions')}</p>
        )}
      </>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {groups.map((group) => {
        const label = localize(group.label, locale);
        const body = (
          <ul className="flex flex-col divide-y divide-border/60">
            {group.permissions.map((definition) => {
              const from = sources?.(definition.key) ?? [];
              return (
                <li
                  key={definition.key}
                  className="flex flex-col gap-1 py-2.5 first:pt-1 last:pb-1"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">
                      {localize(definition.label, locale)}
                    </span>
                    {definition.sensitive ? (
                      <StatusBadge tone="warning" size="sm" icon={Lock}>
                        {t('admin-security.sensitive')}
                      </StatusBadge>
                    ) : null}
                  </div>
                  <p className="text-xs text-pretty text-muted-foreground">
                    {localize(definition.description, locale)}
                  </p>
                  {from.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {from.map((source) => (
                        <StatusBadge key={source} tone="neutral" size="sm">
                          {source}
                        </StatusBadge>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        );
        const count = (
          <span className="shrink-0 text-xs text-muted-foreground tabular">
            {group.permissions.length}
          </span>
        );
        return (
          <li key={group.module} className="rounded-xl border border-border/70 bg-card">
            {collapsible ? (
              <details className="group/details">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-3.5 py-2 outline-none select-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
                  <GroupHeader module={group.module} label={label} count={count} />
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/details:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="px-3.5 pb-2">{body}</div>
              </details>
            ) : (
              <div className="flex flex-col gap-1 px-3.5 py-2.5">
                <div className="flex min-h-9 items-center gap-3">
                  <GroupHeader module={group.module} label={label} count={count} />
                </div>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
