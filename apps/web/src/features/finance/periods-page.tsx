import {
  FINANCE_PERIOD_STATUS_LABELS,
  has,
  localize,
  periodKey,
  type FinancePeriod,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Lock, LockOpen } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { periodsQuery, usePeriodAction } from './api';
import { FinanceNav, Money, ReasonDialog } from './components';
import { PERIOD_STATUS_TONE, todayIn, yearOptions } from './helpers';

export function PeriodsPage() {
  const { t, locale, formatDate, formatDateTime } = useI18n();
  const { churchId, base, access, church } = useChurch();
  const today = todayIn(church.timezone);
  const currentYear = Number(today.slice(0, 4));
  const [state, setState] = useUrlState({ year: currentYear });
  const query = useQuery(periodsQuery(churchId, state.year));
  const action = useMutationToast(usePeriodAction(churchId), {
    success: (_data, variables) =>
      variables.action === 'close' ? t('finance.periodClosed') : t('finance.periodReopened'),
  });
  const [closing, setClosing] = useState<FinancePeriod | null>(null);
  const [reopening, setReopening] = useState<FinancePeriod | null>(null);
  const canManage = has(access, 'finance.manage');
  const monthName = (period: FinancePeriod) =>
    formatDate(`${periodKey(period.year, period.month)}-01`, 'monthYear');

  return (
    <Page size="wide">
      <PageHeader
        icon={CalendarCheck}
        tone="emerald"
        title={t('finance.periodsTitle')}
        description={t('finance.periodsDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navPeriods') },
        ]}
        actions={
          <Select
            aria-label={t('finance.year')}
            className="h-10 w-28"
            value={state.year}
            onChange={(event) => setState({ year: Number(event.target.value) })}
          >
            {yearOptions(currentYear).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        }
      />
      <FinanceNav />
      <Alert variant="info">{t('finance.periodsExplainer')}</Alert>
      {query.isPending ? (
        <SkeletonCards count={6} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.items.map((period, _index, items) => {
            const key = periodKey(period.year, period.month);
            // Books close in order: only the oldest finished month still open is the next step.
            const next = items.find(
              (item) =>
                item.status !== 'closed' &&
                item.entryCount > 0 &&
                periodKey(item.year, item.month) < today.slice(0, 7),
            );
            const future = key > today.slice(0, 7);
            return (
              <li
                key={key}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-soft',
                  future && 'opacity-60',
                  period.status === 'closed' && 'bg-muted/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold capitalize">{monthName(period)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('finance.entriesCount', { count: period.entryCount })}
                    </p>
                  </div>
                  <StatusBadge
                    tone={PERIOD_STATUS_TONE[period.status]}
                    icon={period.status === 'closed' ? Lock : undefined}
                    size="sm"
                  >
                    {localize(FINANCE_PERIOD_STATUS_LABELS[period.status], locale)}
                  </StatusBadge>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('finance.income')}</dt>
                    <dd>
                      <Money value={period.income} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('finance.expense')}</dt>
                    <dd>
                      <Money value={period.expense} />
                    </dd>
                  </div>
                </dl>
                {period.status === 'closed' && period.closedAt ? (
                  <p className="text-xs text-muted-foreground">
                    {t('finance.closedBy', {
                      name: period.closedByName ?? '—',
                      date: formatDateTime(period.closedAt),
                    })}
                  </p>
                ) : null}
                {period.status === 'reopened' && period.reopenReason ? (
                  <p className="text-xs text-muted-foreground">
                    {t('finance.reopenedBy', {
                      name: period.reopenedByName ?? '—',
                      reason: period.reopenReason,
                    })}
                  </p>
                ) : null}
                {period.pendingBatches > 0 && period.status !== 'closed' ? (
                  <Link
                    to={`${base}/finance/offerings?status=submitted`}
                    className="text-xs font-medium text-warning-foreground underline-offset-2 hover:underline"
                  >
                    {t('finance.pendingInMonth', { count: period.pendingBatches })}
                  </Link>
                ) : null}
                {canManage && !future ? (
                  period.status === 'closed' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-auto"
                      onClick={() => setReopening(period)}
                    >
                      <LockOpen />
                      {t('finance.reopen')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={next === period ? 'default' : 'outline'}
                      className="mt-auto"
                      disabled={period.pendingBatches > 0}
                      onClick={() => setClosing(period)}
                    >
                      <Lock />
                      {t('finance.closeMonth')}
                    </Button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={!!closing}
        onOpenChange={(open) => !open && setClosing(null)}
        variant="default"
        title={t('finance.closeTitle', { month: closing ? monthName(closing) : '' })}
        description={t('finance.closeDescription')}
        confirmLabel={t('finance.closeMonth')}
        loading={action.isPending}
        onConfirm={async () => {
          if (
            closing &&
            (await action.run({ year: closing.year, month: closing.month, action: 'close' }))
          )
            setClosing(null);
        }}
      />
      <ReasonDialog
        open={!!reopening}
        onOpenChange={(open) => !open && setReopening(null)}
        title={t('finance.reopenTitle', { month: reopening ? monthName(reopening) : '' })}
        description={t('finance.reopenDescription')}
        confirmLabel={t('finance.reopen')}
        loading={action.isPending}
        onConfirm={async (reason) => {
          if (
            reopening &&
            (await action.run({
              year: reopening.year,
              month: reopening.month,
              action: 'reopen',
              reason,
            }))
          )
            setReopening(null);
        }}
      />
    </Page>
  );
}
