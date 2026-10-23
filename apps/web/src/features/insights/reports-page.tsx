import {
  REPORT_INTERVALS,
  REPORT_INTERVAL_LABELS,
  REPORT_LABELS,
  availableReports,
  localize,
  type Report,
  type ReportInterval,
  type ReportKind,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  CalendarCheck,
  ChartColumnIncreasing,
  ChartNoAxesCombined,
  Coins,
  Download,
  HandHeart,
  HeartHandshake,
  Percent,
  Sprout,
  TrendingUp,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, DonutChart, LineChart } from '@/components/ui/charts';
import { DateRangePicker, presetRange } from '@/components/ui/date-range-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { PrintButton, PrintHeader } from '@/components/ui/print';
import { Skeleton, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { TabsContent, TabsList, TabsTrigger, UrlTabs } from '@/components/ui/tabs';
import type { Tone } from '@/components/ui/tone';
import { groupsQuery } from '@/features/groups/api';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { downloadReportCsv, reportQuery, type ReportParams } from './api';
import { BreakdownBars } from './breakdown-bars';

type StatFormat = 'number' | 'percent' | 'money' | 'decimal';

type StatSpec = {
  key: string;
  labelKey: MessageKey;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  format?: StatFormat;
};

/** What each report shows: its headline numbers, the series of its trend and its donuts. */
const VIEWS: Record<
  ReportKind,
  {
    icon: React.ComponentType<{ className?: string }>;
    stats: StatSpec[];
    /** Series drawn as lines; the first `bars` series is also drawn as bars. */
    lines?: string[];
    bars?: string;
    /** Breakdowns drawn as donuts; the rest become bar lists. */
    donuts?: string[];
    /** Groups by interval; breakdown-only reports hide the interval picker. */
    trend: boolean;
  }
> = {
  membership_growth: {
    icon: Sprout,
    stats: [
      { key: 'total', labelKey: 'insights.total', icon: Users, tone: 'sky' },
      { key: 'new', labelKey: 'insights.new', icon: UserPlus, tone: 'emerald' },
      { key: 'newMembers', labelKey: 'insights.newMembers', icon: UsersRound, tone: 'violet' },
      {
        key: 'growthRate',
        labelKey: 'insights.growthRate',
        icon: TrendingUp,
        tone: 'teal',
        format: 'percent',
      },
    ],
    lines: ['total'],
    bars: 'new',
    trend: true,
  },
  status_breakdown: {
    icon: Users,
    stats: [
      { key: 'total', labelKey: 'insights.total', icon: Users, tone: 'sky' },
      { key: 'member', labelKey: 'insights.member', icon: UsersRound, tone: 'emerald' },
      { key: 'regular', labelKey: 'insights.regular', icon: CalendarCheck, tone: 'teal' },
      { key: 'visitor', labelKey: 'insights.visitor', icon: UserPlus, tone: 'amber' },
    ],
    donuts: ['status'],
    trend: false,
  },
  demographics: {
    icon: ChartNoAxesCombined,
    stats: [
      { key: 'people', labelKey: 'insights.people', icon: Users, tone: 'sky' },
      {
        key: 'averageAge',
        labelKey: 'insights.averageAge',
        icon: Activity,
        tone: 'violet',
        format: 'decimal',
      },
      {
        key: 'withBirthDate',
        labelKey: 'insights.withBirthDate',
        icon: CalendarCheck,
        tone: 'teal',
      },
      { key: 'inHousehold', labelKey: 'insights.inHousehold', icon: UsersRound, tone: 'amber' },
    ],
    donuts: ['gender', 'household'],
    trend: false,
  },
  attendance_trend: {
    icon: CalendarCheck,
    stats: [
      { key: 'attendance', labelKey: 'insights.attendanceTotal', icon: Users, tone: 'teal' },
      { key: 'sessions', labelKey: 'insights.sessions', icon: CalendarCheck, tone: 'sky' },
      { key: 'average', labelKey: 'insights.average', icon: Activity, tone: 'violet' },
      { key: 'peak', labelKey: 'insights.peak', icon: TrendingUp, tone: 'amber' },
    ],
    lines: ['total'],
    donuts: ['headcount'],
    trend: true,
  },
  visitor_conversion: {
    icon: UserPlus,
    stats: [
      { key: 'visitors', labelKey: 'insights.visitors', icon: UserPlus, tone: 'amber' },
      { key: 'converted', labelKey: 'insights.converted', icon: HeartHandshake, tone: 'emerald' },
      {
        key: 'conversionRate',
        labelKey: 'insights.conversionRate',
        icon: Percent,
        tone: 'teal',
        format: 'percent',
      },
      { key: 'counted', labelKey: 'insights.counted', icon: Users, tone: 'sky' },
    ],
    lines: ['visitors', 'converted', 'counted'],
    donuts: ['stages'],
    trend: true,
  },
  volunteer_engagement: {
    icon: HandHeart,
    stats: [
      {
        key: 'activeVolunteers',
        labelKey: 'insights.activeVolunteers',
        icon: HandHeart,
        tone: 'violet',
      },
      { key: 'assignments', labelKey: 'insights.assignments', icon: CalendarCheck, tone: 'sky' },
      {
        key: 'acceptanceRate',
        labelKey: 'insights.acceptanceRate',
        icon: Percent,
        tone: 'emerald',
        format: 'percent',
      },
      {
        key: 'engagementRate',
        labelKey: 'insights.engagementRate',
        icon: Activity,
        tone: 'teal',
        format: 'percent',
      },
    ],
    lines: ['volunteers', 'assignments', 'declined'],
    trend: true,
  },
  giving_trend: {
    icon: Coins,
    stats: [
      {
        key: 'total',
        labelKey: 'insights.givingTotal',
        icon: Coins,
        tone: 'emerald',
        format: 'money',
      },
      {
        key: 'offerings',
        labelKey: 'insights.offerings',
        icon: HandHeart,
        tone: 'teal',
        format: 'money',
      },
      {
        key: 'contributions',
        labelKey: 'insights.contributions',
        icon: HeartHandshake,
        tone: 'violet',
        format: 'money',
      },
      {
        key: 'averagePerPeriod',
        labelKey: 'insights.averagePerPeriod',
        icon: Activity,
        tone: 'sky',
        format: 'money',
      },
    ],
    lines: ['offerings', 'contributions'],
    bars: 'total',
    donuts: ['funds'],
    trend: true,
  },
};

const defaultRange = () => {
  const year = presetRange('thisYear');
  return { from: year.from, to: year.to };
};

export function ReportsPage() {
  const { church, churchId, access } = useChurch();
  const { t, locale, formatDate } = useI18n();
  const kinds = availableReports(access, church.enabledModules);
  const range = defaultRange();
  const [state, setState] = useUrlState({
    report: kinds[0] ?? 'membership_growth',
    from: range.from,
    to: range.to,
    interval: 'month',
    groupId: '',
  });
  const groups = useQuery(groupsQuery(churchId));
  const kind = (kinds.includes(state.report as ReportKind) ? state.report : kinds[0]) as
    ReportKind | undefined;
  const interval = (REPORT_INTERVALS as readonly string[]).includes(state.interval)
    ? (state.interval as ReportInterval)
    : 'month';
  const params: ReportParams = {
    from: state.from,
    to: state.to,
    interval,
    locale,
    groupId: state.groupId || undefined,
  };
  const rangeLabel = `${formatDate(state.from, 'dateShort')} – ${formatDate(state.to, 'dateShort')}`;

  return (
    <Page size="wide">
      <PrintHeader
        churchName={church.name}
        logoUrl={church.logoUrl}
        title={t('insights.reportsTitle')}
        subtitle={t('insights.printSubtitle', {
          report: kind ? localize(REPORT_LABELS[kind], locale) : '',
          range: rangeLabel,
        })}
      />
      <PageHeader
        icon={ChartColumnIncreasing}
        tone="teal"
        title={t('insights.reports')}
        description={t('insights.reportsDescription')}
        actions={kinds.length > 0 ? <PrintButton size="sm" /> : undefined}
      />
      {!kind ? (
        <EmptyState
          icon={ChartColumnIncreasing}
          tone="teal"
          title={t('insights.noReportsTitle')}
          description={t('insights.noReportsBody')}
        />
      ) : (
        <UrlTabs param="report" defaultValue={kind} values={kinds}>
          <TabsList variant="underline" data-print="hide">
            {kinds.map((item) => {
              const Icon = VIEWS[item].icon;
              return (
                <TabsTrigger key={item} value={item}>
                  <Icon />
                  {localize(REPORT_LABELS[item], locale)}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {kinds.map((item) => (
            <TabsContent key={item} value={item} className="flex flex-col gap-4">
              <div data-print="hide">
                <FilterBar
                  actions={
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <DateRangePicker
                        value={{ from: state.from, to: state.to }}
                        presets={['thisMonth', 'lastMonth', 'last90', 'thisYear']}
                        onChange={(next) => setState({ from: next.from, to: next.to })}
                      />
                      <ExportButton kind={item} params={params} />
                    </div>
                  }
                  filters={[
                    ...(VIEWS[item].trend
                      ? [
                          {
                            id: 'interval',
                            label: t('insights.interval'),
                            value: interval === 'month' ? '' : interval,
                            onChange: (value: string) => setState({ interval: value || 'month' }),
                            options: REPORT_INTERVALS.filter((value) => value !== 'month').map(
                              (value) => ({
                                value,
                                label: localize(REPORT_INTERVAL_LABELS[value], locale),
                              }),
                            ),
                          },
                        ]
                      : []),
                    ...(item === 'giving_trend'
                      ? []
                      : [
                          {
                            id: 'group',
                            label: t('insights.group'),
                            value: state.groupId,
                            onChange: (groupId: string) => setState({ groupId }),
                            options: (groups.data?.items ?? []).map((group) => ({
                              value: group.id,
                              label: group.name,
                            })),
                          },
                        ]),
                  ]}
                />
              </div>
              <ReportView kind={item} params={params} />
            </TabsContent>
          ))}
        </UrlTabs>
      )}
    </Page>
  );
}

function ExportButton({ kind, params }: { kind: ReportKind; params: ReportParams }) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-11 sm:h-9"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadReportCsv(churchId, kind, params);
          toast.success(t('insights.exported'));
        } catch (error) {
          toast.error(getErrorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download />
      {t('insights.exportCsv')}
    </Button>
  );
}

function ReportView({ kind, params }: { kind: ReportKind; params: ReportParams }) {
  const { churchId } = useChurch();
  const query = useQuery({
    ...reportQuery(churchId, kind, params),
    placeholderData: keepPreviousData,
  });
  if (query.isPending) {
    return (
      <>
        <SkeletonStats />
        <Skeleton className="h-72" />
      </>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        message={getErrorMessage(query.error)}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  return <ReportBody report={query.data} stale={query.isPlaceholderData} />;
}

function ReportBody({ report, stale }: { report: Report; stale: boolean }) {
  const { t, locale, formatNumber, formatPercent, formatCurrency, formatDate } = useI18n();
  const view = VIEWS[report.kind];
  const money = report.unit === 'money';
  const value = (number: number) =>
    money ? formatCurrency(number, { compact: true }) : formatNumber(number);
  const stat = (spec: StatSpec) => {
    const number = report.totals[spec.key] ?? 0;
    switch (spec.format) {
      case 'percent':
        return formatPercent(number);
      case 'money':
        return formatCurrency(number, { compact: true });
      case 'decimal':
        return formatNumber(number, { maximumFractionDigits: 1 });
      default:
        return formatNumber(number);
    }
  };
  const label = (x: string) => {
    if (report.interval === 'week') return formatDate(x, 'dayMonth');
    if (report.interval === 'quarter') {
      return t('insights.quarter', {
        quarter: Math.floor((Number(x.slice(5, 7)) - 1) / 3) + 1,
        year: x.slice(0, 4),
      });
    }
    if (report.interval === 'year') return x.slice(0, 4);
    const multiYear = report.from.slice(0, 4) !== report.to.slice(0, 4);
    return formatDate(x, {
      options: multiYear ? { month: 'short', year: '2-digit' } : { month: 'short' },
    });
  };
  const series = (key: string) => report.series.find((item) => item.key === key);
  const lineSeries = (view.lines ?? []).flatMap((key) => {
    const found = series(key);
    return found
      ? [{ id: found.key, label: found.label, values: found.points.map((p) => p.y) }]
      : [];
  });
  const labels = (report.series[0]?.points ?? []).map((point) => label(point.x));
  const bars = view.bars ? series(view.bars) : undefined;
  // Extra series (attendance per service or group) as their own comparison chart.
  const tracks =
    report.kind === 'attendance_trend'
      ? report.series.filter((item) => item.key !== 'total' && item.key !== 'sessions').slice(0, 4)
      : [];
  const hasTrend = report.series.some((item) => item.points.some((point) => point.y !== 0));
  const hasBreakdown = report.breakdowns.some((item) =>
    item.items.some((entry) => entry.value !== 0),
  );
  const donuts = report.breakdowns.filter(
    (item) => view.donuts?.includes(item.key) && item.items.some((entry) => entry.value > 0),
  );
  const lists = report.breakdowns.filter(
    (item) => !view.donuts?.includes(item.key) && item.items.length > 0,
  );
  const trend =
    report.kind === 'giving_trend' && (report.totals.previousTotal ?? 0) > 0
      ? { value: report.totals.change ?? 0 }
      : undefined;

  return (
    <div className={stale ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {view.stats.map((spec, index) => (
            <StatCard
              key={spec.key}
              label={t(spec.labelKey)}
              value={stat(spec)}
              icon={spec.icon}
              tone={spec.tone}
              trend={index === 0 ? trend : undefined}
              hint={index === 0 && trend ? t('insights.vsPrevious') : undefined}
            />
          ))}
        </div>

        {!hasTrend && !hasBreakdown ? (
          <EmptyState
            compact
            icon={view.icon}
            tone="teal"
            title={t('insights.emptyTitle')}
            description={t('insights.emptyBody')}
          />
        ) : (
          <>
            {view.trend && hasTrend ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {lineSeries.length > 0 ? (
                  <Card className={bars ? '' : 'lg:col-span-2'}>
                    <CardHeader>
                      <CardTitle>{t('insights.chartTrend')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <LineChart
                        title={localize(REPORT_LABELS[report.kind], locale)}
                        labels={labels}
                        series={lineSeries}
                        format={value}
                      />
                    </CardContent>
                  </Card>
                ) : null}
                {bars ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{bars.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <BarChart
                        title={bars.label}
                        data={bars.points.map((point) => ({
                          label: label(point.x),
                          value: point.y,
                        }))}
                        format={value}
                      />
                    </CardContent>
                  </Card>
                ) : null}
                {tracks.length > 1 ? (
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>{t('insights.chartBreakdown')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <LineChart
                        title={t('insights.chartBreakdown')}
                        labels={labels}
                        series={tracks.map((item) => ({
                          id: item.key,
                          label: item.label,
                          values: item.points.map((point) => point.y),
                        }))}
                        format={value}
                      />
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ) : null}

            {donuts.length > 0 || lists.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {donuts.map((breakdown) => (
                  <Card key={breakdown.key}>
                    <CardHeader>
                      <CardTitle>{breakdown.label}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                      <DonutChart
                        title={breakdown.label}
                        centerLabel={t('insights.total')}
                        data={breakdown.items
                          .filter((item) => item.value > 0)
                          .map((item) => ({ label: item.label, value: item.value }))}
                        format={value}
                      />
                    </CardContent>
                  </Card>
                ))}
                {lists.map((breakdown) => (
                  <Card key={breakdown.key}>
                    <CardHeader>
                      <CardTitle>{breakdown.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <BreakdownBars breakdown={breakdown} format={value} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}

            {view.trend && hasTrend ? (
              <TrendTable
                report={report}
                label={label}
                format={(number) => (money ? formatCurrency(number) : formatNumber(number))}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** Every period and series as a table (also what the print shows). */
function TrendTable({
  report,
  label,
  format,
}: {
  report: Report;
  label: (x: string) => string;
  format: (value: number) => string;
}) {
  const { t } = useI18n();
  const rows = report.series[0]?.points ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('insights.table')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('insights.period')}
                </th>
                {report.series.map((item) => (
                  <th key={item.key} scope="col" className="py-2 pr-4 text-right font-medium">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((point, index) => (
                <tr key={point.x} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-2 pr-4 text-left font-medium">
                    {label(point.x)}
                  </th>
                  {report.series.map((item) => (
                    <td key={item.key} className="py-2 pr-4 text-right tabular">
                      {format(item.points[index]?.y ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
