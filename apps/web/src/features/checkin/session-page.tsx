import {
  CHECKIN_STATUSES,
  CHECKIN_STATUS_LABELS,
  can,
  fullName,
  localize,
  type Checkin,
  type CheckinStatus,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarX2,
  ClipboardCheck,
  LockKeyhole,
  LockKeyholeOpen,
  Pencil,
  Printer,
  ScanLine,
  Trash2,
  TriangleAlert,
  Undo2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { Alert } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { RowActions } from '@/components/ui/row-actions';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isGone, useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import {
  sessionCheckinsQuery,
  sessionQuery,
  useDeleteCheckin,
  useDeleteSession,
  useSetSessionOpen,
} from './api';
import { CHECKIN_TONE, useCheckinAccess } from './checkin-lib';
import { CheckinListRow, ClassStatTile, SessionStatusBadge } from './checkin-ui';
import { CheckoutDialog } from './checkout-dialog';
import { SessionDialog } from './session-dialogs';

const PAGE_SIZE = 25;

/** One session: headcount per class, the check-ins, and closing it into attendance. */
export function SessionPage() {
  const { sessionId = '' } = useParams();
  const { churchId, base, access } = useChurch();
  const { t, locale, formatDate, formatNumber } = useI18n();
  const navigate = useNavigate();
  const { canManage } = useCheckinAccess();
  const query = useQuery(sessionQuery(churchId, sessionId));
  const [state, setState, reset] = useUrlState({ q: '', classId: '', status: '', page: 1 });
  const checkins = useQuery({
    ...sessionCheckinsQuery(churchId, sessionId, {
      q: state.q || undefined,
      classId: state.classId || undefined,
      status: (state.status || undefined) as CheckinStatus | undefined,
      page: state.page,
      limit: PAGE_SIZE,
    }),
    enabled: query.isSuccess,
  });
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'close' | 'reopen' | 'delete' | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Checkin | null>(null);
  const setOpen = useMutationToast(useSetSessionOpen(churchId, sessionId), {
    success: (result) =>
      result.session.status === 'closed'
        ? t('checkin.sessionClosed', { name: result.session.name })
        : t('checkin.sessionReopened', { name: result.session.name }),
  });
  const remove = useMutationToast(useDeleteSession(churchId), {
    success: t('checkin.sessionDeleted'),
  });
  const removeCheckin = useMutationToast(useDeleteCheckin(churchId), {
    success: t('checkin.checkinRemoved'),
  });

  const breadcrumbs = [
    { label: t('checkin.nav'), to: `${base}/checkin` },
    { label: t('checkin.sessionsTitle'), to: `${base}/checkin/sessions` },
  ];

  if (query.isPending) {
    return (
      <Page size="wide">
        <PageHeader title={t('checkin.sessionTitle')} breadcrumbs={breadcrumbs} />
        <SkeletonStats />
        <SkeletonList rows={6} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page size="wide">
        <PageHeader title={t('checkin.sessionTitle')} breadcrumbs={breadcrumbs} />
        {isGone(query.error) ? (
          <EmptyState
            icon={CalendarX2}
            tone={CHECKIN_TONE}
            title={t('checkin.sessionNotFound')}
            description={t('checkin.sessionNotFoundHint')}
            action={
              <Button asChild variant="outline">
                <Link to={`${base}/checkin/sessions`}>{t('checkin.sessionsTitle')}</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            error={query.error}
            message={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )}
      </Page>
    );
  }

  const { session, classes } = query.data;
  const open = session.status === 'open';
  const path = `${base}/checkin/sessions/${session.id}`;
  const alerts = classes.reduce((sum, item) => sum + item.alertCount, 0);
  const warnings = classes.filter((item) => item.ratioExceeded);
  const filters: FilterDefinition[] = [
    {
      id: 'class',
      label: t('checkin.filterClass'),
      value: state.classId,
      onChange: (classId) => setState({ classId }),
      options: classes.map((item) => ({
        value: item.classId,
        label: item.name,
        count: item.totalCount,
      })),
    },
    {
      id: 'status',
      label: t('checkin.filterStatus'),
      value: state.status,
      onChange: (status) => setState({ status }),
      options: CHECKIN_STATUSES.map((status) => ({
        value: status,
        label: localize(CHECKIN_STATUS_LABELS[status], locale),
      })),
    },
  ];
  const filtered = !!(state.q || state.classId || state.status);

  return (
    <Page size="wide">
      <PageHeader
        title={session.name}
        eyebrow={formatDate(session.date, 'dateLong')}
        tone={CHECKIN_TONE}
        breadcrumbs={[...breadcrumbs, { label: session.name }]}
        actions={
          <>
            {open ? (
              <Button asChild size="sm">
                <Link to={`${path}/station`}>
                  <ScanLine />
                  {t('checkin.startStation')}
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <RowActions
                label={t('checkin.sessionActions')}
                actions={[
                  {
                    id: 'edit',
                    label: t('common.edit'),
                    icon: Pencil,
                    onSelect: () => setEditing(true),
                  },
                  {
                    id: 'close',
                    label: t('checkin.closeSession'),
                    icon: LockKeyhole,
                    onSelect: () => setConfirm('close'),
                    hidden: !open,
                  },
                  {
                    id: 'reopen',
                    label: t('checkin.reopenSession'),
                    icon: LockKeyholeOpen,
                    onSelect: () => setConfirm('reopen'),
                    hidden: open,
                  },
                  {
                    id: 'delete',
                    label: t('common.delete'),
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setConfirm('delete'),
                    hidden: session.totalCount > 0,
                  },
                ]}
              />
            ) : null}
          </>
        }
      />
      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <SessionStatusBadge status={session.status} />
        {session.closedAt ? (
          <span className="text-xs text-muted-foreground">
            {t('checkin.closedAt', { date: formatDate(session.closedAt, 'dateTime') })}
          </span>
        ) : null}
      </div>

      {!open ? (
        <Alert
          variant="info"
          title={t('checkin.sessionClosedBanner')}
          action={
            session.attendanceSessionId && can.viewAttendanceOverview(access) ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`${base}/attendance/${session.attendanceSessionId}`}>
                  <ClipboardCheck />
                  {t('checkin.viewAttendance')}
                </Link>
              </Button>
            ) : null
          }
        >
          {t('checkin.sessionClosedBody')}
        </Alert>
      ) : warnings.length > 0 ? (
        <Alert variant="warning" title={t('checkin.ratioWarningTitle')}>
          {warnings
            .map((item) =>
              t('checkin.ratioWarningItem', {
                name: item.name,
                children: item.presentCount,
                teachers: item.teacherCount,
              }),
            )
            .join(' · ')}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('checkin.statInClass')}
          value={formatNumber(session.checkedInCount)}
          icon={Users}
          tone={CHECKIN_TONE}
        />
        <StatCard
          label={t('checkin.statTotal')}
          value={formatNumber(session.totalCount)}
          icon={ClipboardCheck}
          tone="sky"
        />
        <StatCard
          label={t('checkin.statPickedUp')}
          value={formatNumber(session.totalCount - session.checkedInCount)}
          icon={Undo2}
          tone="teal"
        />
        <StatCard
          label={t('checkin.statAlertsInClass')}
          value={formatNumber(alerts)}
          icon={TriangleAlert}
          tone={alerts > 0 ? 'rose' : 'emerald'}
        />
      </div>

      <Section title={t('checkin.classesInSession')}>
        {classes.length === 0 ? (
          <EmptyState compact tone={CHECKIN_TONE} title={t('checkin.noClasses')} />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
            {classes.map((stat) => (
              <ClassStatTile
                key={stat.classId}
                stat={stat}
                to={`${path}/classes/${stat.classId}`}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title={t('checkin.checkinsTitle')}>
        <FilterBar
          search={{
            value: state.q,
            onChange: (q) => setState({ q }),
            placeholder: t('checkin.searchChild'),
          }}
          filters={filters}
          onReset={() => reset()}
        />
        {checkins.isPending ? (
          <SkeletonList rows={5} />
        ) : checkins.isError ? (
          <ErrorState
            error={checkins.error}
            message={getErrorMessage(checkins.error)}
            onRetry={() => void checkins.refetch()}
            retrying={checkins.isFetching}
          />
        ) : checkins.data.items.length === 0 ? (
          <EmptyState
            icon={Users}
            tone={CHECKIN_TONE}
            title={filtered ? t('checkin.noCheckinsFound') : t('checkin.noCheckins')}
            description={
              filtered ? t('common.noResultsHint') : open ? t('checkin.noCheckinsHint') : undefined
            }
            action={
              filtered ? (
                <Button variant="outline" onClick={() => reset()}>
                  {t('common.clearAll')}
                </Button>
              ) : open ? (
                <Button asChild>
                  <Link to={`${path}/station`}>
                    <ScanLine />
                    {t('checkin.startStation')}
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="flex flex-col gap-4" aria-busy={checkins.isFetching || undefined}>
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
              {checkins.data.items.map((item) => (
                <CheckinListRow
                  key={item.id}
                  checkin={item}
                  onCheckOut={() => setCheckingOut(item.id)}
                  actions={
                    <RowActions
                      label={t('checkin.actionsFor', { name: fullName(item.child) })}
                      actions={[
                        {
                          id: 'labels',
                          label: t('checkin.reprintLabels'),
                          icon: Printer,
                          onSelect: () => void navigate(`${base}/checkin/labels?ids=${item.id}`),
                          hidden: item.status !== 'checked_in',
                        },
                        {
                          id: 'child',
                          label: t('checkin.openChild'),
                          icon: Users,
                          onSelect: () =>
                            void navigate(`${base}/checkin/children/${item.child.id}`),
                        },
                        {
                          id: 'remove',
                          label: t('checkin.removeCheckin'),
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => setRemoving(item),
                          hidden: !canManage,
                        },
                      ]}
                    />
                  }
                />
              ))}
            </ul>
            <Pagination
              page={checkins.data.page}
              pageSize={checkins.data.limit}
              total={checkins.data.total}
              onPageChange={(page) => setState({ page }, { push: true })}
            />
          </div>
        )}
      </Section>

      <CheckoutDialog
        checkinId={checkingOut}
        open={!!checkingOut}
        onOpenChange={(next) => {
          if (!next) setCheckingOut(null);
        }}
      />
      {canManage ? (
        <>
          <SessionDialog session={session} open={editing} onOpenChange={setEditing} />
          <ConfirmDialog
            open={confirm === 'close'}
            onOpenChange={(next) => setConfirm(next ? 'close' : null)}
            title={t('checkin.closeSessionTitle', { name: session.name })}
            description={
              session.checkedInCount > 0
                ? t('checkin.closeSessionStillIn', { count: session.checkedInCount })
                : t('checkin.closeSessionBody')
            }
            confirmLabel={t('checkin.closeSession')}
            variant="default"
            loading={setOpen.isPending}
            onConfirm={async () => {
              if (await setOpen.run(false)) setConfirm(null);
            }}
          />
          <ConfirmDialog
            open={confirm === 'reopen'}
            onOpenChange={(next) => setConfirm(next ? 'reopen' : null)}
            title={t('checkin.reopenSessionTitle', { name: session.name })}
            description={t('checkin.reopenSessionBody')}
            confirmLabel={t('checkin.reopenSession')}
            variant="default"
            loading={setOpen.isPending}
            onConfirm={async () => {
              if (await setOpen.run(true)) setConfirm(null);
            }}
          />
          <ConfirmDialog
            open={confirm === 'delete'}
            onOpenChange={(next) => setConfirm(next ? 'delete' : null)}
            title={t('checkin.deleteSessionTitle', { name: session.name })}
            description={t('checkin.deleteSessionBody')}
            confirmLabel={t('common.delete')}
            loading={remove.isPending}
            onConfirm={async () => {
              if (!(await remove.run(session.id))) return;
              setConfirm(null);
              void navigate(`${base}/checkin/sessions`, { replace: true });
            }}
          />
          <ConfirmDialog
            open={!!removing}
            onOpenChange={(next) => {
              if (!next) setRemoving(null);
            }}
            title={t('checkin.removeCheckinTitle', {
              name: removing ? fullName(removing.child) : '',
            })}
            description={t('checkin.removeCheckinBody')}
            confirmLabel={t('checkin.removeCheckin')}
            loading={removeCheckin.isPending}
            onConfirm={async () => {
              if (removing && (await removeCheckin.run(removing.id))) setRemoving(null);
            }}
          />
        </>
      ) : null}
    </Page>
  );
}
