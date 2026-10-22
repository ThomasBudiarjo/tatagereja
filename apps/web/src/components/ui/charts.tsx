import * as React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/*
 * Small inline-SVG charts. Colours come from the validated categorical order (`--chart-1..8`,
 * never cycled); a single series uses `--chart-1`. Every chart has a hover/focus tooltip, a
 * legend for two or more series and a table for screen readers, so no value depends on colour
 * or on hovering.
 */

const seriesColor = (index: number) => `var(--chart-${(index % 8) + 1})`;

type Format = (value: number) => string;

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round axis ticks from zero: 0, 250, 500, … */
const niceTicks = (max: number, count = 4): number[] => {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(value);
  if ((ticks[ticks.length - 1] ?? 0) < max) ticks.push(ticks.length * step);
  return ticks;
};

function ChartTooltip({
  x,
  y,
  width,
  children,
}: {
  x: number;
  y: number;
  width: number;
  children: React.ReactNode;
}) {
  const left = Math.min(Math.max(x, 70), Math.max(70, width - 70));
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-28 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-2.5 py-2 text-xs shadow-overlay"
      style={{ left, top: y - 8 }}
    >
      {children}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; shape?: 'line' | 'box' }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              item.shape === 'line' ? 'h-0.5 w-3.5 rounded-full' : 'size-2.5 rounded-[3px]',
            )}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({
  caption,
  labels,
  series,
  format,
}: {
  caption: string;
  labels: string[];
  series: { label: string; values: number[] }[];
  format: Format;
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col" />
          {series.map((item) => (
            <th key={item.label} scope="col">
              {item.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((label, index) => (
          <tr key={`${label}-${index}`}>
            <th scope="row">{label}</th>
            {series.map((item) => (
              <td key={item.label}>{format(item.values[index] ?? 0)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyChart({ height }: { height: number }) {
  const { t } = useI18n();
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
      style={{ height }}
    >
      {t('common.chartNoData')}
    </div>
  );
}

export type LineSeries = { id: string; label: string; values: number[] };

/** Change over time for one to four series. Arrow keys move the crosshair when focused. */
export function LineChart({
  labels,
  series,
  format,
  height = 220,
  area = series.length === 1,
  title,
  className,
}: {
  /** X labels, one per value (weeks, months). */
  labels: string[];
  series: LineSeries[];
  format?: Format;
  height?: number;
  /** A 10 % wash under a single line. */
  area?: boolean;
  /** Accessible name; also the table caption. */
  title: string;
  className?: string;
}) {
  const { formatNumber } = useI18n();
  const fmt = format ?? ((value: number) => formatNumber(value));
  const compact = (value: number) => formatNumber(value, { notation: 'compact' });
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = React.useState<number | null>(null);
  const max = Math.max(0, ...series.flatMap((item) => item.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? 1;
  const pad = { left: 40, right: 12, top: 12, bottom: 26 };
  const innerWidth = Math.max(0, width - pad.left - pad.right);
  const innerHeight = height - pad.top - pad.bottom;
  const x = (index: number) =>
    pad.left + (labels.length <= 1 ? innerWidth / 2 : (index / (labels.length - 1)) * innerWidth);
  const y = (value: number) => pad.top + innerHeight - (value / top) * innerHeight;
  const labelEvery = Math.max(
    1,
    Math.ceil(labels.length / Math.max(1, Math.floor(innerWidth / 64))),
  );

  if (labels.length === 0 || series.length === 0) return <EmptyChart height={height} />;

  const pick = (clientX: number, rect: DOMRect) => {
    const relative = clientX - rect.left - pad.left;
    const index = Math.round((relative / Math.max(1, innerWidth)) * (labels.length - 1));
    setActive(Math.max(0, Math.min(labels.length - 1, index)));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={title}
            tabIndex={0}
            className="overflow-visible rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            onPointerMove={(event) =>
              pick(event.clientX, event.currentTarget.getBoundingClientRect())
            }
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive((value) => value ?? labels.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                setActive((value) =>
                  Math.max(
                    0,
                    Math.min(
                      labels.length - 1,
                      (value ?? 0) + (event.key === 'ArrowLeft' ? -1 : 1),
                    ),
                  ),
                );
              }
            }}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                />
                <text
                  x={pad.left - 8}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px] tabular"
                >
                  {compact(tick)}
                </text>
              </g>
            ))}
            {labels.map((label, index) =>
              index % labelEvery === 0 || index === labels.length - 1 ? (
                <text
                  key={`${label}-${index}`}
                  x={x(index)}
                  y={height - 6}
                  textAnchor={
                    index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'
                  }
                  className="fill-muted-foreground text-[11px]"
                >
                  {label}
                </text>
              ) : null,
            )}
            {active !== null ? (
              <line
                x1={x(active)}
                x2={x(active)}
                y1={pad.top}
                y2={pad.top + innerHeight}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.4}
                strokeWidth={1}
              />
            ) : null}
            {series.map((item, seriesIndex) => {
              const points = item.values.map((value, index) => `${x(index)},${y(value)}`);
              const color = seriesColor(seriesIndex);
              return (
                <g key={item.id}>
                  {area ? (
                    <path
                      d={`M${x(0)},${y(0)} L${points.join(' L')} L${x(item.values.length - 1)},${y(0)} Z`}
                      fill={color}
                      fillOpacity={0.1}
                    />
                  ) : null}
                  <polyline
                    points={points.join(' ')}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* End marker: the latest value. */}
                  <circle
                    cx={x(item.values.length - 1)}
                    cy={y(item.values[item.values.length - 1] ?? 0)}
                    r={4}
                    fill={color}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                  {active !== null && item.values[active] !== undefined ? (
                    <circle
                      cx={x(active)}
                      cy={y(item.values[active] ?? 0)}
                      r={4.5}
                      fill={color}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : null}
        {active !== null && width > 0 ? (
          <ChartTooltip
            x={x(active)}
            y={Math.min(...series.map((item) => y(item.values[active] ?? 0)))}
            width={width}
          >
            <p className="mb-1 text-muted-foreground">{labels[active]}</p>
            {series.map((item, index) => (
              <p key={item.id} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-0.5 w-3 rounded-full"
                  style={{ backgroundColor: seriesColor(index) }}
                />
                <span className="font-semibold text-foreground tabular">
                  {fmt(item.values[active] ?? 0)}
                </span>
                {series.length > 1 ? (
                  <span className="text-muted-foreground">{item.label}</span>
                ) : null}
              </p>
            ))}
          </ChartTooltip>
        ) : null}
      </div>
      <Legend
        items={series.map((item, index) => ({
          label: item.label,
          color: seriesColor(index),
          shape: 'line',
        }))}
      />
      <DataTable caption={title} labels={labels} series={series} format={fmt} />
    </div>
  );
}

export type BarDatum = { label: string; value: number };

/** Magnitude per category (attendance per service, giving per fund). */
export function BarChart({
  data,
  format,
  height = 220,
  title,
  className,
}: {
  data: BarDatum[];
  format?: Format;
  height?: number;
  title: string;
  className?: string;
}) {
  const { formatNumber } = useI18n();
  const fmt = format ?? ((value: number) => formatNumber(value));
  const compact = (value: number) => formatNumber(value, { notation: 'compact' });
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = React.useState<number | null>(null);
  if (data.length === 0) return <EmptyChart height={height} />;

  const max = Math.max(0, ...data.map((item) => item.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? 1;
  const pad = { left: 40, right: 8, top: 18, bottom: 26 };
  const innerWidth = Math.max(0, width - pad.left - pad.right);
  const innerHeight = height - pad.top - pad.bottom;
  const band = innerWidth / data.length;
  const barWidth = Math.min(24, Math.max(6, band * 0.6));
  const y = (value: number) => pad.top + innerHeight - (value / top) * innerHeight;
  const maxIndex = data.findIndex((item) => item.value === max);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerWidth / 56))));

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={title}
            className="overflow-visible"
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                />
                <text
                  x={pad.left - 8}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px] tabular"
                >
                  {compact(tick)}
                </text>
              </g>
            ))}
            {data.map((item, index) => {
              const cx = pad.left + band * index + band / 2;
              const barHeight = Math.max(0, pad.top + innerHeight - y(item.value));
              const radius = Math.min(4, barHeight);
              const x0 = cx - barWidth / 2;
              const y0 = y(item.value);
              const isActive = active === index;
              return (
                <g
                  key={`${item.label}-${index}`}
                  tabIndex={0}
                  role="presentation"
                  className="outline-none"
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                >
                  {/* Hit area: the whole band, taller than the bar. */}
                  <rect
                    x={pad.left + band * index}
                    y={pad.top}
                    width={band}
                    height={innerHeight}
                    fill="transparent"
                  />
                  {barHeight > 0 ? (
                    <path
                      d={`M${x0},${pad.top + innerHeight} V${y0 + radius} Q${x0},${y0} ${x0 + radius},${y0} H${x0 + barWidth - radius} Q${x0 + barWidth},${y0} ${x0 + barWidth},${y0 + radius} V${pad.top + innerHeight} Z`}
                      fill={seriesColor(0)}
                      opacity={active === null || isActive ? 1 : 0.55}
                      className="transition-opacity duration-150"
                    />
                  ) : null}
                  {index === maxIndex && active === null ? (
                    <text
                      x={cx}
                      y={y0 - 6}
                      textAnchor="middle"
                      className="fill-foreground text-[11px] font-semibold tabular"
                    >
                      {compact(item.value)}
                    </text>
                  ) : null}
                  {index % labelEvery === 0 ? (
                    <text
                      x={cx}
                      y={height - 6}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[11px]"
                    >
                      {item.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : null}
        {active !== null && width > 0 && data[active] ? (
          <ChartTooltip
            x={pad.left + band * active + band / 2}
            y={y(data[active].value)}
            width={width}
          >
            <p className="font-semibold text-foreground tabular">{fmt(data[active].value)}</p>
            <p className="text-muted-foreground">{data[active].label}</p>
          </ChartTooltip>
        ) : null}
      </div>
      <DataTable
        caption={title}
        labels={data.map((item) => item.label)}
        series={[{ label: title, values: data.map((item) => item.value) }]}
        format={fmt}
      />
    </div>
  );
}

/** Parts of a whole (giving by fund, members by status). Up to eight slices; fold the rest into "Other". */
export function DonutChart({
  data,
  format,
  size = 168,
  title,
  centerLabel,
  className,
}: {
  data: BarDatum[];
  format?: Format;
  size?: number;
  title: string;
  /** Text under the total in the middle. */
  centerLabel?: string;
  className?: string;
}) {
  const { t, formatNumber, formatPercent } = useI18n();
  const fmt = format ?? ((value: number) => formatNumber(value));
  const [active, setActive] = React.useState<number | null>(null);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (data.length === 0 || total <= 0) return <EmptyChart height={size} />;

  const radius = size / 2;
  const thickness = Math.max(14, size * 0.14);
  const inner = radius - thickness;
  const gap = 2 / radius; // a 2px surface gap between slices
  const slices = data.slice(0, 8);
  const arcs = slices.map((item, index) => {
    const before = slices.slice(0, index).reduce((sum, slice) => sum + slice.value, 0);
    const angle = -Math.PI / 2 + (before / total) * Math.PI * 2;
    const sweep = (item.value / total) * Math.PI * 2;
    const start = angle + (sweep > gap * 2 ? gap / 2 : 0);
    const end = angle + sweep - (sweep > gap * 2 ? gap / 2 : 0);
    const large = end - start > Math.PI ? 1 : 0;
    const point = (r: number, a: number) =>
      `${radius + r * Math.cos(a)},${radius + r * Math.sin(a)}`;
    const full = sweep >= Math.PI * 2 - 0.0001;
    const d = full
      ? ''
      : `M${point(radius, start)} A${radius},${radius} 0 ${large} 1 ${point(radius, end)} L${point(inner, end)} A${inner},${inner} 0 ${large} 0 ${point(inner, start)} Z`;
    return { item, index, d, full };
  });
  const focus = active !== null ? data[active] : null;

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-4', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={title}>
          {arcs.map(({ item, index, d, full }) =>
            full ? (
              <circle
                key={`${item.label}-${index}`}
                cx={radius}
                cy={radius}
                r={radius - thickness / 2}
                fill="none"
                stroke={seriesColor(index)}
                strokeWidth={thickness}
              />
            ) : (
              <path
                key={`${item.label}-${index}`}
                d={d}
                fill={seriesColor(index)}
                opacity={active === null || active === index ? 1 : 0.45}
                className="transition-opacity duration-150"
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
              />
            ),
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-bold tracking-tight">
            {fmt(focus ? focus.value : total)}
          </span>
          <span className="max-w-[70%] truncate text-xs text-muted-foreground">
            {focus ? focus.label : (centerLabel ?? t('common.total'))}
          </span>
        </div>
      </div>
      <ul className="flex min-w-44 flex-1 flex-col gap-1.5 text-sm">
        {data.slice(0, 8).map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <button
              type="button"
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              onPointerEnter={() => setActive(index)}
              onPointerLeave={() => setActive(null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                active === index && 'bg-muted',
              )}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: seriesColor(index) }}
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="font-semibold tabular">{fmt(item.value)}</span>
              <span className="w-10 text-right text-xs text-muted-foreground tabular">
                {formatPercent(item.value / total)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A tiny trend line for stat cards. Decorative: the card states the number. */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map(
    (value, index) =>
      `${(index / (values.length - 1)) * (width - 4) + 2},${height - 2 - ((value - min) / span) * (height - 4)}`,
  );
  const last = points[points.length - 1]?.split(',') ?? ['0', '0'];
  return (
    <svg width={width} height={height} aria-hidden className={cn('overflow-visible', className)}>
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeOpacity={0.5}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r={3}
        fill="var(--chart-1)"
        stroke="var(--card)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
