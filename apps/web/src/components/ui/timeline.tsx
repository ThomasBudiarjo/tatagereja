import * as React from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from './tone';

/** A vertical history: care notes, registry changes, audit entries, giving. */
export function Timeline({ className, ...props }: React.ComponentProps<'ol'>) {
  return <ol className={cn('relative flex flex-col', className)} {...props} />;
}

export function TimelineItem({
  icon: Icon,
  tone = 'neutral',
  title,
  time,
  children,
  last = false,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  title: React.ReactNode;
  /** Usually a relative or short date. */
  time?: React.ReactNode;
  children?: React.ReactNode;
  /** Hides the connector below the last item. */
  last?: boolean;
  className?: string;
}) {
  return (
    <li className={cn('relative flex gap-3 pb-5 last:pb-0', className)}>
      {!last ? (
        <span aria-hidden className="absolute top-9 bottom-1 left-[15px] w-px bg-border" />
      ) : null}
      <span
        data-tone={tone}
        aria-hidden
        className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-tone-soft text-tone-ink ring-4 ring-background"
      >
        {Icon ? <Icon className="size-4" /> : <span className="size-2 rounded-full bg-tone" />}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-medium">{title}</p>
          {time ? <p className="text-xs text-muted-foreground tabular">{time}</p> : null}
        </div>
        {children ? <div className="mt-1 text-sm text-muted-foreground">{children}</div> : null}
      </div>
    </li>
  );
}
