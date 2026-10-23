import type { ReportBreakdown } from '@tatagereja/shared';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Categories as labelled horizontal bars, longest first when `sorted`. Each row states its value
 * and share in text, so nothing depends on the bar length or colour; one hue keeps it calm.
 */
export function BreakdownBars({
  breakdown,
  format,
  className,
}: {
  breakdown: ReportBreakdown;
  format?: (value: number) => string;
  className?: string;
}) {
  const { formatNumber, formatPercent } = useI18n();
  const fmt = format ?? ((value: number) => formatNumber(value));
  const total = breakdown.items.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(0, ...breakdown.items.map((item) => item.value));
  return (
    <ul aria-label={breakdown.label} className={cn('flex flex-col gap-2.5', className)}>
      {breakdown.items.map((item) => (
        <li key={item.key} className="group flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 font-semibold tabular">
              {fmt(item.value)}
              {total > 0 ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {formatPercent(item.value / total)}
                </span>
              ) : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full transition-[width] duration-300 group-hover:opacity-80 motion-reduce:transition-none"
              style={{
                width: `${max === 0 ? 0 : (item.value / max) * 100}%`,
                backgroundColor: 'var(--chart-1)',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
