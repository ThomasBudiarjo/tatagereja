import {
  CHECKIN_SESSION_STATUSES,
  CHECKIN_SESSION_STATUS_LABELS,
  localize,
  type CheckinSessionStatus,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, History } from 'lucide-react';
import { useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { sessionsQuery } from './api';
import { CHECKIN_TONE, useCheckinAccess } from './checkin-lib';
import { CheckinNav, SessionRow } from './checkin-ui';
import { SessionDialog } from './session-dialogs';

const PAGE_SIZE = 20;

/** Every check-in session, newest first, with status and date filters. */
export function SessionsPage() {
  const { churchId, base } = useChurch();
  const { t, locale } = useI18n();
  const { canManage } = useCheckinAccess();
  const [opening, setOpening] = useState(false);
  const [state, setState, reset] = useUrlState({
    q: '',
    status: '',
    from: '',
    to: '',
    page: 1,
  });
  const query = useQuery(
    sessionsQuery(churchId, {
      q: state.q || undefined,
      status: (state.status || undefined) as CheckinSessionStatus | undefined,
      from: state.from || undefined,
      to: state.to || undefined,
      page: state.page,
      limit: PAGE_SIZE,
    }),
  );
  const filters: FilterDefinition[] = [
    {
      id: 'status',
      label: t('checkin.filterStatus'),
      value: state.status,
      onChange: (status) => setState({ status }),
      options: CHECKIN_SESSION_STATUSES.map((status) => ({
        value: status,
        label: localize(CHECKIN_SESSION_STATUS_LABELS[status], locale),
      })),
    },
  ];
  const filtered = !!(state.q || state.status || state.from || state.to);

  return (
    <Page size="wide">
      <PageHeader
        title={t('checkin.sessionsTitle')}
        description={t('checkin.sessionsDescription')}
        breadcrumbs={[
          { label: t('checkin.nav'), to: `${base}/checkin` },
          { label: t('checkin.sessionsTitle') },
        ]}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setOpening(true)}>
              <CalendarPlus />
              {t('checkin.openSession')}
            </Button>
          ) : null
        }
      />
      <CheckinNav />
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('checkin.searchSessions'),
        }}
        filters={filters}
        actions={
          <DateRangePicker
            value={{ from: state.from, to: state.to }}
            onChange={(range) => setState({ from: range.from, to: range.to })}
            className="shrink-0"
          />
        }
        onReset={() => reset()}
      />

      {query.isPending ? (
        <SkeletonList rows={5} avatar={false} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={History}
          tone={CHECKIN_TONE}
          title={filtered ? t('checkin.noSessionsFound') : t('checkin.noSessions')}
          description={
            filtered
              ? t('common.noResultsHint')
              : canManage
                ? t('checkin.noOpenSessionManage')
                : t('checkin.noOpenSessionOperate')
          }
          action={
            filtered ? (
              <Button variant="outline" onClick={() => reset()}>
                {t('common.clearAll')}
              </Button>
            ) : canManage ? (
              <Button onClick={() => setOpening(true)}>
                <CalendarPlus />
                {t('checkin.openSession')}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-4" aria-busy={query.isFetching || undefined}>
          <div className="grid gap-2.5 lg:grid-cols-2">
            {query.data.items.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => {
              setState({ page }, { push: true });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      )}
      {canManage ? <SessionDialog open={opening} onOpenChange={setOpening} /> : null}
    </Page>
  );
}
