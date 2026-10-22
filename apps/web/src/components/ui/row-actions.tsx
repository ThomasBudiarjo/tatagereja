import { MoreHorizontal } from 'lucide-react';
import * as React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

export type RowAction = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Leave out actions the caller may not take instead of disabling them. */
  hidden?: boolean;
};

/** The "⋯" menu at the end of a row. Renders nothing when no action is visible. */
export function RowActions({
  actions,
  label,
  className,
}: {
  actions: RowAction[];
  /** Accessible name, e.g. "Actions for Budi Santoso". */
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const visible = actions.filter((action) => !action.hidden);
  if (visible.length === 0) return null;
  const regular = visible.filter((action) => !action.destructive);
  const destructive = visible.filter((action) => action.destructive);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('text-muted-foreground data-[state=open]:bg-muted', className)}
          aria-label={label ?? t('common.moreActions')}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {regular.map((action) => (
          <DropdownMenuItem key={action.id} disabled={action.disabled} onSelect={action.onSelect}>
            {action.icon ? <action.icon /> : null}
            {action.label}
          </DropdownMenuItem>
        ))}
        {regular.length > 0 && destructive.length > 0 ? <DropdownMenuSeparator /> : null}
        {destructive.map((action) => (
          <DropdownMenuItem
            key={action.id}
            destructive
            disabled={action.disabled}
            onSelect={action.onSelect}
          >
            {action.icon ? <action.icon /> : null}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
