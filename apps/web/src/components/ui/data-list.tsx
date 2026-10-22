import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { RowActions, type RowAction } from './row-actions';

export type DataListProps<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  title: (item: T) => React.ReactNode;
  subtitle?: (item: T) => React.ReactNode;
  leading?: (item: T) => React.ReactNode;
  /** Badges or short values on the right. */
  trailing?: (item: T) => React.ReactNode;
  /** Makes the row a link. */
  href?: (item: T) => string | undefined;
  onRowClick?: (item: T) => void;
  /** Per-row menu; hidden actions are left out and rows without actions get no menu. */
  actions?: (item: T) => RowAction[];
  /** Accessible name of the row menu. */
  actionsLabel?: (item: T) => string;
  className?: string;
  /** Rows as separate cards instead of one grouped list. */
  variant?: 'grouped' | 'cards';
};

/**
 * A list of records with a consistent row anatomy (leading, title, subtitle, trailing,
 * chevron or row actions). Use it for any list on phones; `ResponsiveTable` switches to a
 * table on wide screens.
 */
export function DataList<T>({
  items,
  getKey,
  title,
  subtitle,
  leading,
  trailing,
  href,
  onRowClick,
  actions,
  actionsLabel,
  className,
  variant = 'grouped',
}: DataListProps<T>) {
  return (
    <ul
      className={cn(
        variant === 'grouped'
          ? 'divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft'
          : 'flex flex-col gap-2',
        className,
      )}
    >
      {items.map((item) => {
        const to = href?.(item);
        const rowActions = actions?.(item).filter((action) => !action.hidden) ?? [];
        const content = (
          <>
            {leading ? <div className="shrink-0">{leading(item)}</div> : null}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{title(item)}</div>
              {subtitle ? (
                <div className="truncate text-sm text-muted-foreground">{subtitle(item)}</div>
              ) : null}
            </div>
            {trailing ? (
              <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                {trailing(item)}
              </div>
            ) : null}
            {to && rowActions.length === 0 ? (
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            ) : null}
          </>
        );
        const interactive = !!to || !!onRowClick;
        const rowClass = cn(
          'group flex min-h-16 w-full min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left outline-none',
          interactive &&
            'transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 active:bg-muted',
        );
        return (
          <li
            key={getKey(item)}
            className={cn(
              'flex items-center',
              variant === 'cards' &&
                'overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft',
            )}
          >
            {to ? (
              <Link to={to} className={rowClass}>
                {content}
              </Link>
            ) : onRowClick ? (
              <button type="button" onClick={() => onRowClick(item)} className={rowClass}>
                {content}
              </button>
            ) : (
              <div className={rowClass}>{content}</div>
            )}
            {rowActions.length > 0 ? (
              <div className="pr-2">
                <RowActions actions={rowActions} label={actionsLabel?.(item)} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
