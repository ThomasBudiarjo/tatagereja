import {
  CONTRIBUTION_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  fullName,
  has,
  localize,
  progressRatio,
  type GivingStatement,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileText, HandHeart, HeartHandshake } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PrintButton, PrintSheet } from '@/components/ui/print';
import { Select } from '@/components/ui/select';
import { SkeletonStats, SkeletonText } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { givingStatementQuery, myGivingQuery } from './api';
import { Meter, Money } from './components';
import { todayIn, yearOptions } from './helpers';

function YearSelect({ year, onChange }: { year: number; onChange: (year: number) => void }) {
  const { t } = useI18n();
  const { church } = useChurch();
  const current = Number(todayIn(church.timezone).slice(0, 4));
  return (
    <Select
      aria-label={t('finance.year')}
      data-print="hide"
      className="h-10 w-28"
      value={year}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {yearOptions(current).map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </Select>
  );
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div data-print="hide" className="-mt-2 flex items-center justify-between gap-2">
      {children}
    </div>
  );
}

/** "My giving": every member's own contributions and pledges, printable for tax or family records. */
export function MyGivingPage() {
  const { t } = useI18n();
  const { churchId, church } = useChurch();
  const [state, setState] = useUrlState({ year: Number(todayIn(church.timezone).slice(0, 4)) });
  const query = useQuery({
    ...myGivingQuery(churchId, state.year),
    placeholderData: keepPreviousData,
  });
  return (
    <Page>
      <PageHeader
        icon={HeartHandshake}
        tone="teal"
        title={t('finance.myGiving')}
        description={t('finance.myGivingDescription')}
      />
      <Toolbar>
        <YearSelect year={state.year} onChange={(year) => setState({ year })} />
        {query.data?.statement ? <PrintButton size="sm" /> : null}
      </Toolbar>
      {query.isPending ? (
        <>
          <SkeletonStats count={2} />
          <SkeletonText lines={6} />
        </>
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : !query.data.statement ? (
        <EmptyState
          icon={HeartHandshake}
          tone="teal"
          title={t('finance.noProfileTitle')}
          description={t('finance.noProfileDescription')}
        />
      ) : (
        <StatementView statement={query.data.statement} own />
      )}
    </Page>
  );
}

/** A person's yearly giving statement (rekap persembahan tahunan), laid out for printing. */
export function GivingStatementPage() {
  const { t } = useI18n();
  const { churchId, base, church, access } = useChurch();
  const { personId = '' } = useParams();
  const [state, setState] = useUrlState({ year: Number(todayIn(church.timezone).slice(0, 4)) });
  const query = useQuery({
    ...givingStatementQuery(churchId, personId, state.year),
    placeholderData: keepPreviousData,
  });
  const name = query.data ? fullName(query.data.statement.person) : t('finance.statement');
  const denied =
    query.isError && isApiClientError(query.error) && [403, 404].includes(query.error.status);
  return (
    <Page>
      <PageHeader
        icon={FileText}
        tone="teal"
        title={name}
        description={t('finance.statementDescription', { year: state.year })}
        breadcrumbs={
          has(access, 'finance.reports')
            ? [
                { label: t('finance.nav'), to: `${base}/finance` },
                {
                  label: t('finance.navReports'),
                  to: `${base}/finance/reports?report=statements&year=${state.year}`,
                },
                { label: name },
              ]
            : undefined
        }
      />
      {!denied ? (
        <Toolbar>
          <YearSelect year={state.year} onChange={(year) => setState({ year })} />
          {query.data ? <PrintButton size="sm" /> : null}
        </Toolbar>
      ) : null}
      {query.isPending ? (
        <SkeletonText lines={8} />
      ) : query.isError ? (
        denied ? (
          <NoAccessState />
        ) : (
          <ErrorState
            error={query.error}
            message={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        )
      ) : (
        <StatementView statement={query.data.statement} />
      )}
    </Page>
  );
}

function StatementView({ statement, own = false }: { statement: GivingStatement; own?: boolean }) {
  const { t, locale, formatDate, formatCurrency, formatPercent } = useI18n();
  const { church, base } = useChurch();
  const name = fullName(statement.person);
  return (
    <>
      {own ? (
        <div className="grid grid-cols-2 gap-3" data-print="hide">
          <StatCard
            label={t('finance.totalGiving', { year: statement.year })}
            value={formatCurrency(statement.total, { compact: true })}
            icon={HeartHandshake}
            tone="teal"
          />
          <StatCard
            label={t('finance.giftsCountLabel')}
            value={statement.items.length}
            icon={FileText}
            tone="sky"
          />
        </div>
      ) : null}

      <PrintSheet className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            {church.logoUrl ? (
              <img src={church.logoUrl} alt="" className="size-12 object-contain" />
            ) : null}
            <div>
              <p className="text-lg font-bold">{church.name}</p>
              <p className="text-sm text-muted-foreground">
                {t('finance.statementTitle', { year: statement.year })}
              </p>
            </div>
          </div>
          <EntityAvatar
            name={name}
            src={statement.person.photoUrl}
            size="lg"
            className="print:hidden"
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-overline text-muted-foreground">{t('finance.statementFor')}</p>
            <p className="text-xl font-bold">{name}</p>
          </div>
          <div className="text-right">
            <p className="text-overline text-muted-foreground">{t('finance.total')}</p>
            <p className="text-2xl font-bold tabular">{formatCurrency(statement.total)}</p>
          </div>
        </div>

        {statement.items.length === 0 ? (
          <p className="rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            {t('finance.noGiftsThisYear', { year: statement.year })}
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold">{t('finance.byKind')}</p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {statement.byKind.map((item) => (
                    <li key={item.kind} className="flex justify-between gap-3">
                      <span>{localize(CONTRIBUTION_KIND_LABELS[item.kind], locale)}</span>
                      <Money value={item.amount} />
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">{t('finance.byFund')}</p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {statement.byFund.map((item) => (
                    <li key={item.fundName} className="flex justify-between gap-3">
                      <span>{item.fundName}</span>
                      <Money value={item.amount} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 text-left font-medium">{t('finance.date')}</th>
                    <th className="py-2 text-left font-medium">{t('finance.kind')}</th>
                    <th className="hidden py-2 text-left font-medium sm:table-cell">
                      {t('finance.receiptNumber')}
                    </th>
                    <th className="py-2 text-right font-medium">{t('finance.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.items.map((item) => (
                    <tr key={item.id} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {formatDate(item.receivedAt, 'dateShort')}
                      </td>
                      <td className="py-2">
                        {localize(CONTRIBUTION_KIND_LABELS[item.kind], locale)}
                        <span className="block text-xs text-muted-foreground">
                          {item.fundName} · {localize(PAYMENT_METHOD_LABELS[item.method], locale)}
                        </span>
                        <Link
                          to={`${base}/finance/giving/${item.id}`}
                          className="block font-mono text-[11px] text-muted-foreground hover:underline sm:hidden print:no-underline"
                        >
                          {item.receiptNumber}
                        </Link>
                      </td>
                      <td className="hidden py-2 font-mono text-xs sm:table-cell">
                        <Link
                          to={`${base}/finance/giving/${item.id}`}
                          className="hover:underline print:no-underline"
                        >
                          {item.receiptNumber}
                        </Link>
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <Money value={item.amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          {t('finance.statementFooter', { date: formatDate(new Date(), 'dateLong') })}
        </p>
      </PrintSheet>

      {statement.pledges.length > 0 ? (
        <Section title={t('finance.myPledges')} icon={HandHeart}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {statement.pledges.map((pledge) => {
              const ratio = progressRatio(pledge.amount, pledge.paidAmount);
              return (
                <li key={pledge.id}>
                  <Card>
                    <CardContent className="flex flex-col gap-2">
                      <p className="font-semibold">{pledge.campaignName}</p>
                      <Meter value={ratio} tone="amber" label={t('finance.pledgeProgress')} />
                      <p className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {t('finance.paidOf', { paid: formatCurrency(pledge.paidAmount) })}
                        </span>
                        <span className="font-semibold tabular">{formatPercent(ratio)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('finance.pledgeTotal', { amount: formatCurrency(pledge.amount) })}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
      {own ? (
        <p className="text-center text-xs text-muted-foreground" data-print="hide">
          {t('finance.myGivingPrivacy')}
        </p>
      ) : null}
    </>
  );
}
