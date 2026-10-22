import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import * as React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from './button';

/** Numbered pages around the current one: 1 … 4 5 6 … 12. */
const pageWindow = (page: number, totalPages: number): (number | 'gap')[] => {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous > 1) result.push('gap');
    result.push(value);
  });
  return result;
};

/**
 * Page controls for server-paginated lists. Keep `page` in the URL (`useUrlState`) and scroll
 * the list into view after a change.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const { t, formatNumber } = useI18n();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label={t('common.pageOf', { page, total: totalPages })}
      className={cn('flex items-center justify-between gap-3', className)}
    >
      <p className="text-sm text-muted-foreground tabular">
        {t('common.showingRange', {
          from: formatNumber(from),
          to: formatNumber(to),
          total: formatNumber(total),
        })}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          className="size-9"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t('common.previous')}
        >
          <ChevronLeft />
        </Button>
        <div className="hidden items-center gap-1 sm:flex">
          {pageWindow(page, totalPages).map((value, index) =>
            value === 'gap' ? (
              <span key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden>
                …
              </span>
            ) : (
              <Button
                key={value}
                variant={value === page ? 'soft' : 'ghost'}
                size="icon-sm"
                className="size-9 tabular"
                aria-current={value === page ? 'page' : undefined}
                onClick={() => onPageChange(value)}
              >
                {value}
              </Button>
            ),
          )}
        </div>
        <span className="px-2 text-sm text-muted-foreground tabular sm:hidden">
          {page}/{totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          className="size-9"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t('common.next')}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

/**
 * The end of an infinite list (`useInfiniteQuery`): loads the next page when it scrolls into
 * view, with a button as the accessible fallback.
 */
export function InfiniteListFooter({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  className,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  className?: string;
}) {
  const { t } = useI18n();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const element = ref.current;
    if (!element || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '240px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div ref={ref} className={cn('flex justify-center py-3', className)}>
      {hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}
          {isFetchingNextPage ? t('common.loading') : t('common.loadMore')}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{t('common.endOfList')}</p>
      )}
    </div>
  );
}
