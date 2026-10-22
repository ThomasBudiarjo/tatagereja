import * as React from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from './tone';

/**
 * A colour-coded status: `<StatusBadge tone="success" dot>Aktif</StatusBadge>`. Pair the colour
 * with a word; colour alone never carries the meaning.
 */
export function StatusBadge({
  tone = 'neutral',
  dot = false,
  icon: Icon,
  size = 'md',
  className,
  children,
  ...props
}: React.ComponentProps<'span'> & {
  tone?: Tone;
  dot?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-tone-soft font-semibold whitespace-nowrap text-tone-ink',
        size === 'md' ? 'h-6 px-2.5 text-xs' : 'h-5 px-2 text-[11px]',
        className,
      )}
      {...props}
    >
      {dot ? <span className="size-1.5 rounded-full bg-tone" aria-hidden /> : null}
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </span>
  );
}

/** The icon chip used for modules and stat cards. */
export function ToneIcon({
  icon: Icon,
  tone = 'brand',
  size = 'md',
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      data-tone={tone}
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-tone-soft text-tone-ink',
        size === 'sm' && 'size-8 rounded-lg [&>svg]:size-4',
        size === 'md' && 'size-10 rounded-xl [&>svg]:size-5',
        size === 'lg' && 'size-12 rounded-2xl [&>svg]:size-6',
        className,
      )}
    >
      <Icon />
    </span>
  );
}
