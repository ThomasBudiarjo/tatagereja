import { fullName } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Baby, ChevronRight, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { childrenQuery, classesQuery } from './api';
import { CHECKIN_TONE } from './checkin-lib';
import { AlertBadges, CheckinNav, ChildAvatar } from './checkin-ui';
import { NewChildDialog } from './child-dialogs';

const PAGE_SIZE = 30;

/** Every Sekolah Minggu child: search, alerts and usual class filters. */
export function ChildrenPage() {
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [registering, setRegistering] = useState(false);
  const [state, setState, reset] = useUrlState({
    q: '',
    alerts: false as boolean,
    classId: '',
    page: 1,
  });
  const classes = useQuery(classesQuery(churchId, true));
  const query = useQuery(
    childrenQuery(churchId, {
      q: state.q || undefined,
      alerts: state.alerts || undefined,
      classId: state.classId || undefined,
      page: state.page,
      limit: PAGE_SIZE,
    }),
  );
  const classNames = new Map((classes.data?.items ?? []).map((item) => [item.id, item.name]));
  const filters: FilterDefinition[] = [
    {
      id: 'alerts',
      label: t('checkin.filterAlerts'),
      value: state.alerts ? '1' : '',
      onChange: (value) => setState({ alerts: value === '1' }),
      options: [{ value: '1', label: t('checkin.withAlertsOnly') }],
    },
    {
      id: 'class',
      label: t('checkin.filterUsualClass'),
      value: state.classId,
      onChange: (classId) => setState({ classId }),
      options: (classes.data?.items ?? []).map((item) => ({ value: item.id, label: item.name })),
    },
  ];
  const filtered = !!(state.q || state.alerts || state.classId);

  return (
    <Page size="wide">
      <PageHeader
        title={t('checkin.childrenTitle')}
        description={t('checkin.childrenDescription')}
        breadcrumbs={[
          { label: t('checkin.nav'), to: `${base}/checkin` },
          { label: t('checkin.childrenTitle') },
        ]}
        actions={
          <Button size="sm" onClick={() => setRegistering(true)}>
            <UserPlus />
            {t('checkin.newChild')}
          </Button>
        }
      />
      <CheckinNav />
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('checkin.searchChildren'),
        }}
        filters={filters}
        onReset={() => reset()}
      />
      {query.isPending ? (
        <SkeletonList rows={8} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Baby}
          tone={CHECKIN_TONE}
          title={filtered ? t('checkin.noChildrenFound') : t('checkin.noChildren')}
          description={filtered ? t('common.noResultsHint') : t('checkin.noChildrenHint')}
          action={
            filtered ? (
              <Button variant="outline" onClick={() => reset()}>
                {t('common.clearAll')}
              </Button>
            ) : (
              <Button onClick={() => setRegistering(true)}>
                <UserPlus />
                {t('checkin.newChild')}
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-4" aria-busy={query.isFetching || undefined}>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
            {query.data.items.map((child) => {
              const classId = child.defaultClassId ?? child.suggestedClassId;
              return (
                <li key={child.id}>
                  <Link
                    to={`${base}/checkin/children/${child.id}`}
                    className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
                  >
                    <ChildAvatar child={child} alerts={child.alerts} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{fullName(child)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          child.age !== null ? t('checkin.ageYears', { count: child.age }) : null,
                          child.householdName,
                          classId ? classNames.get(classId) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <AlertBadges alerts={child.alerts} className="mt-1" />
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
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
      <NewChildDialog
        classes={classes.data?.items ?? []}
        open={registering}
        onOpenChange={setRegistering}
        onCreated={(child) => void navigate(`${base}/checkin/children/${child.id}`)}
      />
    </Page>
  );
}
