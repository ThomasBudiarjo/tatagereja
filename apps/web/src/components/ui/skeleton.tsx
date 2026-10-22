import * as React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Placeholder shapes shown while data loads. They match the layout they stand in for. */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-shimmer rounded-lg bg-muted dark:bg-muted/80', className)}
      {...props}
    />
  );
}

/** Announces loading once for a group of skeletons. */
function LoadingRegion({ className, children }: { className?: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" aria-busy className={className}>
      <span className="sr-only">{t('common.loading')}</span>
      {children}
    </div>
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <LoadingRegion className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn('h-3.5', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </LoadingRegion>
  );
}

/** Rows like `ListRow`: avatar, two lines of text and a trailing badge. */
export function SkeletonList({
  rows = 5,
  avatar = true,
  className,
}: {
  rows?: number;
  avatar?: boolean;
  className?: string;
}) {
  return (
    <LoadingRegion
      className={cn(
        'divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft',
        className,
      )}
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3.5">
          {avatar ? <Skeleton className="size-10 shrink-0 rounded-full" /> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5" style={{ width: `${55 + ((index * 17) % 35)}%` }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function SkeletonStats({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <LoadingRegion className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-soft"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <LoadingRegion className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-soft"
        >
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function SkeletonTable({
  rows = 6,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <LoadingRegion
      className={cn(
        'overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft',
        className,
      )}
    >
      <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4 border-b px-4 py-3.5 last:border-b-0">
          {Array.from({ length: columns }).map((_, column) => (
            <Skeleton key={column} className={cn('h-3.5 flex-1', column === 0 && 'flex-[1.6]')} />
          ))}
        </div>
      ))}
    </LoadingRegion>
  );
}

/** A whole page: header, stats and a list. Used while a lazy route loads. */
export function SkeletonPage({ className }: { className?: string }) {
  return (
    <div
      className={cn('mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6', className)}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-56" />
      </div>
      <SkeletonList rows={6} />
    </div>
  );
}
