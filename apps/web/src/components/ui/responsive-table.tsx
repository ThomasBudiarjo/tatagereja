import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { RowActions, type RowAction } from './row-actions';

export type SortDirection = 'asc' | 'desc';
export type SortState = { key: string; direction: SortDirection };

export type Column<T> = {
  id: string;
  header: React.ReactNode;
  cell: (item: T) => React.ReactNode;
  /** The card title on phones (one column). */
  primary?: boolean;
  /** Shown under the title on phones instead of as a labelled row. */
  secondary?: boolean;
  /** Left out of the phone card. */
  hideOnMobile?: boolean;
  /** Left out of the table below `lg`. */
  hideBelowLg?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Makes the header a sort button with this key. */
  sortKey?: string;
  className?: string;
};

/** Parses and formats `sort` URL values such as `name` and `-createdAt`. */
export const parseSort = (value: string): SortState =>
  value.startsWith('-')
    ? { key: value.slice(1), direction: 'desc' }
    : { key: value, direction: 'asc' };
export const formatSort = (sort: SortState): string =>
  sort.direction === 'desc' ? `-${sort.key}` : sort.key;

/**
 * A table on wide screens and a stack of cards on phones, from one column definition.
 * Rows can link somewhere (`href`), and get a "⋯" menu from `actions`.
 */
export function ResponsiveTable<T>({
  items,
  columns,
  getKey,
  href,
  actions,
  actionsLabel,
  sort,
  onSortChange,
  caption,
  className,
}: {
  items: readonly T[];
  columns: Column<T>[];
  getKey: (item: T) => string;
  href?: (item: T) => string | undefined;
  actions?: (item: T) => RowAction[];
  actionsLabel?: (item: T) => string;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  /** Accessible table name. */
  caption?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const primary = columns.find((column) => column.primary) ?? columns[0];
  const secondary = columns.filter((column) => column.secondary);
  const details = columns.filter(
    (column) => column !== primary && !column.secondary && !column.hideOnMobile,
  );
  const hasActions = !!actions && items.some((item) => actions(item).some((a) => !a.hidden));

  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    onSortChange(
      sort?.key === key
        ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  };

  return (
    <div className={className}>
      {/* Phones and small tablets: cards. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {items.map((item) => {
          const to = href?.(item);
          const rowActions = actions?.(item).filter((action) => !action.hidden) ?? [];
          return (
            <li
              key={getKey(item)}
              className={cn(
                'relative rounded-xl border border-border/70 bg-card p-4 shadow-soft',
                to && 'pressable',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {to ? (
                      // The link covers the whole card; the row menu sits above it.
                      <Link
                        to={to}
                        className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40"
                      >
                        {primary?.cell(item)}
                      </Link>
                    ) : (
                      primary?.cell(item)
                    )}
                  </div>
                  {secondary.map((column) => (
                    <div key={column.id} className="mt-0.5 text-sm text-muted-foreground">
                      {column.cell(item)}
                    </div>
                  ))}
                </div>
                {rowActions.length > 0 ? (
                  <div className="relative z-10 -mt-1 -mr-2">
                    <RowActions actions={rowActions} label={actionsLabel?.(item)} />
                  </div>
                ) : to ? (
                  <ChevronRight className="mt-0.5 size-4 text-muted-foreground/60" aria-hidden />
                ) : null}
              </div>
              {details.length > 0 ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-sm">
                  {details.map((column) => (
                    <div key={column.id} className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{column.header}</dt>
                      <dd className="truncate font-medium">{column.cell(item)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Tablets and desktops: a table. */}
      <div className="hidden overflow-x-auto rounded-xl border border-border/70 bg-card shadow-soft md:block">
        <table className="w-full border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-muted/45 text-left">
            <tr>
              {columns.map((column) => {
                const sorted = sort && column.sortKey && sort.key === column.sortKey;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={
                      sorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className={cn(
                      'h-11 px-4 text-xs font-semibold whitespace-nowrap text-muted-foreground',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      column.hideBelowLg && 'hidden lg:table-cell',
                      column.className,
                    )}
                  >
                    {column.sortKey && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.sortKey ?? column.id)}
                        className={cn(
                          '-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground',
                          sorted && 'text-foreground',
                        )}
                      >
                        {column.header}
                        {sorted ? (
                          sort.direction === 'asc' ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3.5" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
              {hasActions ? (
                <th scope="col" className="w-12 px-2">
                  <span className="sr-only">{t('common.actions')}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const to = href?.(item);
              return (
                <tr
                  key={getKey(item)}
                  onClick={
                    to
                      ? (event) => {
                          // Links and buttons inside the row handle their own clicks.
                          if ((event.target as HTMLElement).closest('a,button,input,label')) return;
                          navigate(to);
                        }
                      : undefined
                  }
                  className={cn(
                    'border-t border-border/60 transition-colors',
                    to && 'cursor-pointer hover:bg-muted/40',
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        'h-14 px-4 align-middle',
                        column.primary && 'font-medium',
                        column.align === 'right' && 'text-right tabular',
                        column.align === 'center' && 'text-center',
                        column.hideBelowLg && 'hidden lg:table-cell',
                        column.className,
                      )}
                    >
                      {column === primary && to ? (
                        <Link
                          to={to}
                          className="rounded-sm outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
                        >
                          {column.cell(item)}
                        </Link>
                      ) : (
                        column.cell(item)
                      )}
                    </td>
                  ))}
                  {hasActions ? (
                    <td className="px-2 text-right" onClick={(event) => event.stopPropagation()}>
                      <RowActions actions={actions?.(item) ?? []} label={actionsLabel?.(item)} />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
