import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';
import { ToneIcon } from './status-badge';
import type { Tone } from './tone';

export type Trend = {
  /** Change against the previous period, e.g. 0.12 for +12 % or a count. */
  value: number;
  format?: 'percent' | 'number';
  /** Whether going up is good (members) or bad (absences). Defaults to good. */
  upIsGood?: boolean;
};

/**
 * A headline number with its label, an icon in the module tone and an optional trend. With
 * `to` the whole card is a link.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  trend,
  to,
  loading = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  trend?: Trend;
  to?: string;
  loading?: boolean;
  className?: string;
}) {
  const { t, formatNumber, formatPercent } = useI18n();
  const direction = !trend || trend.value === 0 ? 'flat' : trend.value > 0 ? 'up' : 'down';
  const good = direction === 'flat' ? null : (direction === 'up') === (trend?.upIsGood ?? true);
  const trendText = trend
    ? trend.format === 'number'
      ? formatNumber(Math.abs(trend.value))
      : formatPercent(Math.abs(trend.value), 1)
    : '';
  const TrendIcon =
    direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-overline pt-1 text-muted-foreground">{label}</p>
        {icon ? <ToneIcon icon={icon} tone={tone} size="sm" /> : null}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className="mt-0.5 text-2xl leading-tight font-bold tracking-tight sm:mt-1 sm:text-[1.75rem]">
          {value}
        </p>
      )}
      <div className="mt-1 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {trend && !loading ? (
          <span
            data-tone={good === null ? 'neutral' : good ? 'success' : 'danger'}
            className="inline-flex items-center gap-0.5 rounded-full bg-tone-soft px-1.5 py-0.5 font-semibold text-tone-ink"
          >
            <TrendIcon className="size-3" aria-hidden />
            <span aria-hidden>{direction === 'flat' ? '0' : trendText}</span>
            <span className="sr-only">
              {direction === 'flat'
                ? t('common.trendFlat')
                : t(direction === 'up' ? 'common.trendUp' : 'common.trendDown', {
                    value: trendText,
                  })}
            </span>
          </span>
        ) : null}
        {hint ? <span className="truncate">{hint}</span> : null}
        {to ? (
          <ArrowRight
            className="ml-auto size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
            aria-hidden
          />
        ) : null}
      </div>
    </>
  );

  const classes = cn(
    'group flex flex-col rounded-xl border border-border/70 bg-card p-3.5 shadow-soft sm:p-4',
    to &&
      'pressable outline-none hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40',
    className,
  );
  return to ? (
    <Link to={to} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
