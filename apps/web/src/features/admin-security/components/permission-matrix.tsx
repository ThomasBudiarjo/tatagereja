import { PERMISSION_GROUPS, localize, type Permission } from '@tatagereja/shared';
import { Lock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useModuleLook } from './module-look';

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

function GroupIcon({ module }: { module: (typeof PERMISSION_GROUPS)[number]['module'] }) {
  const { icon: Icon, tone } = useModuleLook(module);
  return (
    <span
      data-tone={tone}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tone-soft text-tone-ink"
      aria-hidden
    >
      {Icon ? <Icon className="size-4" /> : null}
    </span>
  );
}

/**
 * The permission matrix of the role editor: every grantable permission grouped by module,
 * with a select-all per module. Permissions the caller does not hold are shown locked, so
 * people see why they cannot grant them (anti-escalation is enforced by the API too).
 */
export function PermissionMatrix({
  value,
  onChange,
  grantable,
  readOnly = false,
  search = '',
  onlySelected = false,
}: {
  value: readonly Permission[];
  onChange: (next: Permission[]) => void;
  grantable: ReadonlySet<Permission>;
  readOnly?: boolean;
  search?: string;
  onlySelected?: boolean;
}) {
  const { t, locale } = useI18n();
  const needle = normalize(search.trim());
  const selected = new Set(value);

  const groups = PERMISSION_GROUPS.map((group) => ({
    ...group,
    permissions: group.permissions.filter((definition) => {
      if (definition.ownerOnly) return false;
      if (onlySelected && !selected.has(definition.key)) return false;
      if (!needle) return true;
      return normalize(
        `${localize(definition.label, locale)} ${localize(definition.description, locale)} ${definition.key} ${localize(group.label, locale)}`,
      ).includes(needle);
    }),
  })).filter((group) => group.permissions.length > 0);

  const toggle = (permission: Permission, on: boolean) => {
    const next = new Set(value);
    if (on) next.add(permission);
    else next.delete(permission);
    onChange([...next]);
  };

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        {t('admin-security.matrixNoMatch')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const editable = group.permissions.filter((definition) => grantable.has(definition.key));
        const checkedCount = group.permissions.filter((definition) =>
          selected.has(definition.key),
        ).length;
        const editableChecked = editable.filter((definition) => selected.has(definition.key));
        const allState =
          editable.length > 0 && editableChecked.length === editable.length
            ? true
            : editableChecked.length > 0
              ? 'indeterminate'
              : false;
        const groupId = `matrix-${group.module}`;
        return (
          <fieldset
            key={group.module}
            className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft"
            aria-describedby={`${groupId}-count`}
          >
            <legend className="sr-only">{localize(group.label, locale)}</legend>
            <div className="flex items-center gap-3 border-b border-border/60 bg-muted/30 px-3.5 py-2.5">
              <GroupIcon module={group.module} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold tracking-tight">
                  {localize(group.label, locale)}
                </p>
                <p id={`${groupId}-count`} className="text-xs text-muted-foreground tabular">
                  {t('admin-security.matrixGroupCount', {
                    selected: checkedCount,
                    total: group.permissions.length,
                  })}
                </p>
              </div>
              {!readOnly && editable.length > 1 ? (
                <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                  {t('admin-security.matrixSelectAll')}
                  <Checkbox
                    checked={allState}
                    onCheckedChange={(state) => {
                      const next = new Set(value);
                      for (const definition of editable) {
                        if (state === true) next.add(definition.key);
                        else next.delete(definition.key);
                      }
                      onChange([...next]);
                    }}
                    aria-label={t('admin-security.matrixSelectAllIn', {
                      module: localize(group.label, locale),
                    })}
                  />
                </label>
              ) : null}
            </div>
            <ul className="divide-y divide-border/60">
              {group.permissions.map((definition) => {
                const allowed = grantable.has(definition.key) && !readOnly;
                const checked = selected.has(definition.key);
                const id = `perm-${definition.key}`;
                return (
                  <li key={definition.key}>
                    <label
                      htmlFor={id}
                      className={cn(
                        'flex min-h-14 items-start gap-3 px-3.5 py-3 transition-colors',
                        allowed ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default',
                        checked && 'bg-accent/40',
                      )}
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        disabled={!allowed}
                        onCheckedChange={(state) => toggle(definition.key, state === true)}
                        className="mt-0.5"
                        aria-describedby={`${id}-description`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium">
                            {localize(definition.label, locale)}
                          </span>
                          {definition.sensitive ? (
                            <StatusBadge tone="warning" size="sm">
                              {t('admin-security.sensitive')}
                            </StatusBadge>
                          ) : null}
                          {definition.memberDefault ? (
                            <StatusBadge tone="neutral" size="sm">
                              {t('admin-security.memberDefault')}
                            </StatusBadge>
                          ) : null}
                        </span>
                        <span
                          id={`${id}-description`}
                          className="mt-0.5 block text-xs text-pretty text-muted-foreground"
                        >
                          {localize(definition.description, locale)}
                        </span>
                        {!grantable.has(definition.key) && !readOnly ? (
                          <span className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <Lock className="size-3" aria-hidden />
                            {t('admin-security.matrixLocked')}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
}
