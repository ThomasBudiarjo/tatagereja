import { Inbox, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from './tone';

/** A soft illustration built from the icon and the tone; replace it with `illustration`. */
export function EmptyIllustration({
  icon: Icon = Inbox,
  tone = 'brand',
  size = 'md',
  className,
}: {
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  tone?: Tone;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      data-tone={tone}
      aria-hidden
      className={cn('relative shrink-0', size === 'md' ? 'size-28' : 'size-20', className)}
    >
      <svg viewBox="0 0 112 112" className="absolute inset-0 size-full text-tone" fill="none">
        <circle cx="56" cy="56" r="52" fill="var(--tone-soft)" />
        <circle
          cx="56"
          cy="56"
          r="41"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeDasharray="2 6"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
        <path
          d="M19 26l1.6 3.9L24.5 31.5l-3.9 1.6L19 37l-1.6-3.9-3.9-1.6 3.9-1.6z"
          fill="currentColor"
          fillOpacity="0.55"
        />
        <path
          d="M93 77l1.2 2.8 2.8 1.2-2.8 1.2L93 85l-1.2-2.8L89 81l2.8-1.2z"
          fill="currentColor"
          fillOpacity="0.45"
        />
        <circle cx="92" cy="25" r="2.5" fill="currentColor" fillOpacity="0.35" />
        <circle cx="22" cy="84" r="2" fill="currentColor" fillOpacity="0.3" />
      </svg>
      <div className="absolute inset-[27%] translate-x-[7%] -translate-y-[4%] rotate-[9deg] rounded-xl border border-border/70 bg-card/70" />
      <div className="absolute inset-[25%] flex items-center justify-center rounded-2xl border border-border/70 bg-card shadow-raised">
        <Icon className={cn('text-tone-ink', size === 'md' ? 'size-7' : 'size-5')} />
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  tone = 'brand',
  illustration,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  className,
}: {
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  tone?: Tone;
  /** Replaces the default illustration. */
  illustration?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Only pass actions the caller is allowed to take. */
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex animate-rise-in flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 text-center',
        compact ? 'px-5 py-7' : 'px-6 py-10 sm:py-12',
        className,
      )}
    >
      {illustration ?? <EmptyIllustration icon={icon} tone={tone} size={compact ? 'sm' : 'md'} />}
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="text-base font-semibold tracking-tight text-balance">{title}</p>
        {description ? (
          <p className="text-sm text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className="flex flex-col items-center gap-2 sm:flex-row">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
