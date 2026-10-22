import {
  FINANCE_REPORT_KINDS,
  FINANCE_REPORT_LABELS,
  fullName,
  localize,
  type FinanceReport,
  type FinanceReportKind,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChartColumnIncreasing, Download, FileText, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart, DonutChart, LineChart } from '@/components/ui/charts';
import { DataList } from '@/components/ui/data-list';
import { DateRangePicker, presetRange } from '@/components/ui/date-range-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { PrintButton, PrintHeader } from '@/components/ui/print';
import { Select } from '@/components/ui/select';
import { Skeleton, SkeletonList } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { TabsContent, TabsList, TabsTrigger, UrlTabs } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { csvUrl, downloadCsv, givingStatementsQuery, reportQuery } from './api';
import { FinanceNav, Money } from './components';
import { todayIn, useFinanceSetup, yearOptions } from './helpers';

const TABS = [...FINANCE_REPORT_KINDS, 'statements'] as const;

export function ReportsPage() {
  const { t, locale, formatDate } = useI18n();
  const { base, church } = useChurch();
  const setup = useFinanceSetup();
  const year = presetRange('thisYear');
  const [state, setState] = useUrlState({
    from: year.from,
    to: year.to,
    fundId: '',
    accountId: '',
  });
  return (
    <Page size="wide">
      <PrintHeader
        churchName={church.name}
        logoUrl={church.logoUrl}
        title={t('finance.reportsTitle')}
        subtitle={`${formatDate(state.from, 'dateShort')} – ${formatDate(state.to, 'dateShort')}`}
      />
      <PageHeader
        icon={ChartColumnIncreasing}
        tone="emerald"
        title={t('finance.navReports')}
        description={t('finance.reportsDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navReports') },
        ]}
        actions={<PrintButton size="sm" />}
      />
      <FinanceNav />
      <UrlTabs param="report" defaultValue="income_expense" values={TABS}>
        <TabsList variant="underline" data-print="hide">
          {FINANCE_REPORT_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {localize(FINANCE_REPORT_LABELS[kind], locale)}
            </TabsTrigger>
          ))}
          <TabsTrigger value="statements">{t('finance.statements')}</TabsTrigger>
        </TabsList>
        {FINANCE_REPORT_KINDS.map((kind) => (
          <TabsContent key={kind} value={kind} className="flex flex-col gap-4">
            <div data-print="hide">
              <FilterBar
                actions={
                  <DateRangePicker
                    value={{ from: state.from, to: state.to }}
                    presets={['thisMonth', 'lastMonth', 'last90', 'thisYear']}
                    onChange={(range) => setState({ from: range.from, to: range.to })}
                  />
                }
                filters={[
                  {
                    id: 'fund',
                    label: t('finance.fund'),
                    value: state.fundId,
                    onChange: (fundId) => setState({ fundId }),
                    options: setup.funds.map((fund) => ({ value: fund.id, label: fund.name })),
                  },
                  {
                    id: 'account',
                    label: t('finance.account'),
                    value: state.accountId,
                    onChange: (accountId) => setState({ accountId }),
                    options: setup.accounts.map((account) => ({
                      value: account.id,
                      label: account.name,
                    })),
                  },
                ]}
              />
            </div>
            <ReportView
              kind={kind}
              params={{
                from: state.from,
                to: state.to,
                fundId: state.fundId || undefined,
                accountId: state.accountId || undefined,
              }}
            />
          </TabsContent>
        ))}
        <TabsContent value="statements" className="flex flex-col gap-4">
          <StatementsTab />
        </TabsContent>
      </UrlTabs>
    </Page>
  );
}

function ReportView({
  kind,
  params,
}: {
  kind: FinanceReportKind;
  params: { from: string; to: string; fundId?: string; accountId?: string };
}) {
  const { t, locale, formatCurrency, formatDate } = useI18n();
  const { churchId } = useChurch();
  const query = useQuery({
    ...reportQuery(churchId, kind, params),
    placeholderData: keepPreviousData,
  });
  const [exporting, setExporting] = useState(false);
  const compact = (value: number) => formatCurrency(value, { compact: true });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadCsv(
        csvUrl(churchId, `/reports/${kind}`),
        params,
        `laporan-${kind}-${params.from}-${params.to}.csv`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  if (query.isPending) {
    return (
      <>
        <Skeleton className="h-28" />
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
  const report = query.data;
  const labelOf = (key: string, label: string) =>
    kind === 'income_expense'
      ? formatDate(`${key}-01`, 'monthYear')
      : kind === 'trend'
        ? formatDate(key, 'dayMonth')
        : key === 'uncategorized'
          ? t('finance.noCategory')
          : label;
  const empty = report.rows.every((row) => row.income === 0 && row.expense === 0 && !row.opening);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={t('finance.income')} value={compact(report.totals.income)} tone="teal" />
        <StatCard label={t('finance.expense')} value={compact(report.totals.expense)} tone="rose" />
        <StatCard
          label={t('finance.net')}
          value={formatCurrency(report.totals.net, { compact: true, signDisplay: 'exceptZero' })}
          tone={report.totals.net >= 0 ? 'success' : 'danger'}
          className="col-span-2 lg:col-span-1"
        />
      </div>
      {empty ? (
        <EmptyState
          compact
          icon={ChartColumnIncreasing}
          tone="emerald"
          title={t('finance.reportEmptyTitle')}
          description={t('finance.reportEmptyDescription')}
        />
      ) : (
        <Card>
          <CardContent>
            {kind === 'income_expense' ? (
              <LineChart
                title={localize(FINANCE_REPORT_LABELS[kind], locale)}
                labels={report.rows.map((row) =>
                  formatDate(`${row.key}-01`, { options: { month: 'short' } }),
                )}
                series={[
                  {
                    id: 'income',
                    label: t('finance.income'),
                    values: report.rows.map((row) => row.income),
                  },
                  {
                    id: 'expense',
                    label: t('finance.expense'),
                    values: report.rows.map((row) => row.expense),
                  },
                ]}
                format={compact}
              />
            ) : kind === 'trend' ? (
              <BarChart
                title={t('finance.weeklyIncome')}
                data={report.rows.map((row) => ({
                  label: formatDate(row.key, 'dayMonth'),
                  value: row.income,
                }))}
                format={compact}
              />
            ) : kind === 'by_fund' ? (
              <DonutChart
                title={t('finance.incomeByFund')}
                centerLabel={t('finance.income')}
                data={report.rows
                  .filter((row) => row.income > 0)
                  .map((row) => ({ label: row.label, value: row.income }))}
                format={compact}
              />
            ) : kind === 'by_category' ? (
              <div className="grid gap-6 md:grid-cols-2">
                <DonutChart
                  title={t('finance.incomeByCategory')}
                  centerLabel={t('finance.income')}
                  data={report.rows
                    .filter((row) => row.income > 0)
                    .map((row) => ({ label: labelOf(row.key, row.label), value: row.income }))}
                  format={compact}
                />
                <DonutChart
                  title={t('finance.expenseByCategory')}
                  centerLabel={t('finance.expense')}
                  data={report.rows
                    .filter((row) => row.expense > 0)
                    .map((row) => ({ label: labelOf(row.key, row.label), value: row.expense }))}
                  format={compact}
                />
              </div>
            ) : (
              <BarChart
                title={t('finance.closingBalances')}
                data={report.rows.map((row) => ({
                  label: row.label,
                  value: Math.max(0, row.closing ?? 0),
                }))}
                format={compact}
              />
            )}
          </CardContent>
        </Card>
      )}
      <div className="flex justify-end" data-print="hide">
        <Button variant="outline" loading={exporting} onClick={() => void exportCsv()}>
          {!exporting ? <Download /> : null}
          {t('finance.exportCsv')}
        </Button>
      </div>
      <ReportTable report={report} labelOf={labelOf} />
    </>
  );
}

function ReportTable({
  report,
  labelOf,
}: {
  report: FinanceReport;
  labelOf: (key: string, label: string) => string;
}) {
  const { t } = useI18n();
  const cashFlow = report.kind === 'cash_flow';
  const headers = [
    t('finance.item'),
    ...(cashFlow ? [t('finance.openingBalance')] : []),
    t('finance.income'),
    t('finance.expense'),
    t('finance.net'),
    ...(cashFlow ? [t('finance.closingBalance')] : []),
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-soft">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <caption className="sr-only">{t('finance.reportTable')}</caption>
        <thead className="bg-muted/45">
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                scope="col"
                className={cn(
                  'h-11 px-4 text-xs font-semibold whitespace-nowrap text-muted-foreground',
                  index === 0 ? 'text-left' : 'text-right',
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.key} className="border-t border-border/60">
              <th scope="row" className="h-12 px-4 text-left font-medium">
                {labelOf(row.key, row.label)}
              </th>
              {cashFlow ? (
                <td className="px-4 text-right">
                  <Money value={row.opening} />
                </td>
              ) : null}
              <td className="px-4 text-right">
                <Money value={row.income} />
              </td>
              <td className="px-4 text-right">
                <Money value={row.expense} />
              </td>
              <td className="px-4 text-right">
                <Money value={row.net} signed />
              </td>
              {cashFlow ? (
                <td className="px-4 text-right">
                  <Money value={row.closing} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/40 font-semibold">
            <th scope="row" className="h-12 px-4 text-left">
              {t('finance.total')}
            </th>
            {cashFlow ? <td /> : null}
            <td className="px-4 text-right">
              <Money value={report.totals.income} />
            </td>
            <td className="px-4 text-right">
              <Money value={report.totals.expense} />
            </td>
            <td className="px-4 text-right">
              <Money value={report.totals.net} signed />
            </td>
            {cashFlow ? <td /> : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StatementsTab() {
  const { t, formatDate } = useI18n();
  const { churchId, base, church } = useChurch();
  const currentYear = Number(todayIn(church.timezone).slice(0, 4));
  const [state, setState] = useUrlState({ year: currentYear, q: '', page: 1 });
  const params = { year: state.year, q: state.q || undefined, page: state.page, limit: 25 };
  const query = useQuery({
    ...givingStatementsQuery(churchId, params),
    placeholderData: keepPreviousData,
  });
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadCsv(
        csvUrl(churchId, '/giving-statements'),
        { year: state.year },
        `rekap-persembahan-${state.year}.csv`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('finance.searchPeople'),
        }}
        actions={
          <>
            <Select
              aria-label={t('finance.year')}
              className="h-11 w-28"
              value={state.year}
              onChange={(event) => setState({ year: Number(event.target.value) })}
            >
              {yearOptions(currentYear).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label={t('finance.exportCsv')}
              loading={exporting}
              onClick={() => void exportCsv()}
            >
              {!exporting ? <Download /> : null}
            </Button>
          </>
        }
      />
      {query.isPending ? (
        <SkeletonList rows={5} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          tone="teal"
          title={t('finance.noStatementsTitle')}
          description={t('finance.noStatementsDescription')}
        />
      ) : (
        <>
          {query.data.anonymousTotal > 0 ? (
            <p className="flex items-baseline justify-between rounded-xl bg-muted/50 px-4 py-3 text-sm">
              <span className="text-muted-foreground">{t('finance.anonymousGifts')}</span>
              <Money value={query.data.anonymousTotal} />
            </p>
          ) : null}
          <DataList
            items={query.data.items}
            getKey={(item) => item.person.id}
            href={(item) => `${base}/finance/statements/${item.person.id}?year=${state.year}`}
            leading={(item) => (
              <EntityAvatar name={fullName(item.person)} src={item.person.photoUrl} />
            )}
            title={(item) => fullName(item.person)}
            subtitle={(item) =>
              `${t('finance.giftsCount', { count: item.count })}${item.lastGiftAt ? ` · ${t('finance.lastGift', { date: formatDate(item.lastGiftAt, 'dateShort') })}` : ''}`
            }
            trailing={(item) => (
              <span className="flex items-center gap-2">
                <Money value={item.total} />
                <FileText className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
              </span>
            )}
          />
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => setState({ page })}
          />
        </>
      )}
    </>
  );
}
