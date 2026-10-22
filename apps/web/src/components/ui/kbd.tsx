import * as React from 'react';
import { cn } from '@/lib/utils';

/** A keyboard key hint. Hidden on touch-only devices, where it means nothing. */
export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'pointer-events-none hidden h-5 min-w-5 items-center justify-center rounded border border-b-2 bg-muted px-1 font-sans text-[10px] font-semibold text-muted-foreground select-none [@media(hover:hover)]:inline-flex',
        className,
      )}
      {...props}
    />
  );
}

/** "⌘K" on Apple devices, "Ctrl K" elsewhere. */
export const modifierKey = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
