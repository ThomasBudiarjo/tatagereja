import { has, isCareTeam } from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Footprints, Lock, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { DataList } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { visitsQuery, type VisitListParams } from './api';
import { CareNav } from './components';
import { personName, useToday } from './helpers';
import { addDays } from './dates';

const PAGE_SIZE = 25;

/** A date chip: day number over a short month. */
export function DateChip({ date }: { date: string }) {
  const { formatDate } = useI18n();
  return (
    <span
      data-tone="teal"
      className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-tone-soft text-tone-ink"
      aria-hidden
    >
      <span className="text-lg leading-none font-bold tabular">{date.slice(8, 10)}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase">
        {formatDate(date, { preset: 'month', options: { month: 'short' } })}
      </span>
    </span>
  );
}

export function VisitsPage() {
  const { t } = useI18n();
  const { churchId, base, access } = useChurch();
  const today = useToday();
  const team = isCareTeam(access);
  const canLog = has(access, 'care.manage');
  const [state, setState, reset] = useUrlState({
    q: '',
    period: '',
    followUp: '',
    mine: false as boolean,
    page: 1,
  });
  const from =
    state.period === 'month'
      ? `${today.slice(0, 7)}-01`
      : state.period === 'quarter'
        ? addDays(today, -90)
        : state.period === 'year'
          ? `${today.slice(0, 4)}-01-01`
          : undefined;
  const params: VisitListParams = {
    q: state.q || undefined,
    from,
    followUpNeeded:
      state.followUp === 'needed' ? 'true' : state.followUp === 'none' ? 'false' : undefined,
    mine: state.mine || !team ? 'true' : undefined,
    page: state.page,
    limit: PAGE_SIZE,
  };
  const query = useQuery({ ...visitsQuery(churchId, params), placeholderData: keepPreviousData });
  const filtered = !!(state.q || state.period || state.followUp || state.mine);
  const logVisit = canLog ? (
    <Button asChild size="sm">
      <Link to={`${base}/care/visits/new`}>
        <Plus />
        <span className="hidden sm:inline">{t('care.logVisit')}</span>
        <span className="sm:hidden">{t('common.add')}</span>
      </Link>
    </Button>
  ) : null;

  return (
    <Page>
      <PageHeader
        icon={Footprints}
        tone="teal"
        title={t('care.navVisits')}
        description={t('care.visitsDescription')}
        breadcrumbs={[{ label: t('care.nav'), to: `${base}/care` }, { label: t('care.navVisits') }]}
        actions={logVisit}
      />
      <CareNav />
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('care.searchVisits'),
        }}
        filters={[
          {
            id: 'period',
            label: t('care.period'),
            value: state.period,
            onChange: (period) => setState({ period }),
            options: [
              { value: 'month', label: t('common.rangeThisMonth') },
              { value: 'quarter', label: t('care.last90Days') },
              { value: 'year', label: t('common.rangeThisYear') },
            ],
          },
          {
            id: 'followUp',
            label: t('care.followUp'),
            value: state.followUp,
            onChange: (followUp) => setState({ followUp }),
            options: [
              { value: 'needed', label: t('care.followUpNeeded') },
              { value: 'none', label: t('care.noFollowUpNeeded') },
            ],
          },
          ...(team
            ? [
                {
                  id: 'mine',
                  label: t('care.visitor'),
                  value: state.mine ? 'mine' : '',
                  onChange: (value: string) => setState({ mine: value === 'mine' }),
                  options: [{ value: 'mine', label: t('care.myVisits') }],
                },
              ]
            : []),
        ]}
        onReset={() => reset()}
      />
      {query.isPending ? (
        <SkeletonList rows={6} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Footprints}
          tone="teal"
          title={filtered ? t('common.noResults') : t('care.noVisitsTitle')}
          description={filtered ? t('common.noResultsHint') : t('care.noVisitsDescription')}
          action={!filtered ? logVisit : null}
        />
      ) : (
        <>
          <DataList
            items={query.data.items}
            getKey={(visit) => visit.id}
            href={(visit) => `${base}/care/visits/${visit.id}`}
            leading={(visit) => <DateChip date={visit.visitDate} />}
            title={(visit) => (
              <span className="inline-flex items-center gap-1.5">
                {visit.confidentiality === 'confidential' ? (
                  <Lock
                    className="size-3.5 shrink-0 text-destructive"
                    aria-label={t('care.confidential')}
                  />
                ) : null}
                {personName(visit.person) ?? visit.household?.name ?? t('care.visitUntitled')}
              </span>
            )}
            subtitle={(visit) =>
              [
                visit.location,
                visit.visitors.map((person) => personName(person)).join(', ') ||
                  visit.otherVisitors,
              ]
                .filter(Boolean)
                .join(' · ')
            }
            trailing={(visit) =>
              visit.followUpNeeded ? (
                <StatusBadge tone="warning" size="sm">
                  {t('care.followUp')}
                </StatusBadge>
              ) : null
            }
          />
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => setState({ page })}
          />
        </>
      )}
    </Page>
  );
}
