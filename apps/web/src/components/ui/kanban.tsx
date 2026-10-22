import * as React from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from './tone';

const DRAG_TYPE = 'application/x-tatagereja-card';

/**
 * Columns that scroll sideways with snap on phones (follow-ups, expense approvals, care
 * cases). Dragging is a shortcut only: always offer a keyboard and touch way to move a card,
 * such as a status menu on the card.
 */
export function KanbanBoard({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0',
        className,
      )}
      {...props}
    />
  );
}

export function KanbanColumn({
  title,
  count,
  tone = 'neutral',
  actions,
  onDropCard,
  children,
  className,
}: {
  title: React.ReactNode;
  count?: number;
  tone?: Tone;
  actions?: React.ReactNode;
  /** Called with the dragged card's id when a card is dropped here. */
  onDropCard?: (cardId: string) => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const [over, setOver] = React.useState(false);
  return (
    <section
      data-tone={tone}
      className={cn(
        'flex w-[82vw] max-w-80 shrink-0 snap-start flex-col rounded-2xl border border-border/70 bg-sunken/70 transition-colors sm:w-72',
        over && 'border-tone/50 bg-tone-soft/40',
        className,
      )}
      onDragOver={
        onDropCard
          ? (event) => {
              if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
              event.preventDefault();
              setOver(true);
            }
          : undefined
      }
      onDragLeave={() => setOver(false)}
      onDrop={
        onDropCard
          ? (event) => {
              const id = event.dataTransfer.getData(DRAG_TYPE);
              setOver(false);
              if (id) onDropCard(id);
            }
          : undefined
      }
    >
      <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        <span className="size-2 rounded-full bg-tone" aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h3>
        {count !== undefined ? (
          <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular">
            {count}
          </span>
        ) : null}
        {actions}
      </header>
      <div className="flex min-h-24 flex-col gap-2 px-2.5 pb-2.5">{children}</div>
    </section>
  );
}

export function KanbanCard({
  id,
  draggable = true,
  className,
  ...props
}: React.ComponentProps<'div'> & { id: string; draggable?: boolean }) {
  return (
    <div
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className={cn(
        'rounded-xl border border-border/70 bg-card p-3 shadow-xs transition-shadow hover:shadow-soft',
        draggable && 'cursor-grab active:cursor-grabbing',
        className,
      )}
      {...props}
    />
  );
}
