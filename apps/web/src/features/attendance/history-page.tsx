import { fullName, type AttendanceHistory } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, ClipboardList, Flame, Link2Off, Percent, Trophy } from 'lucide-react';
import { useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart } from '@/components/ui/charts';
import { EmptyState } from '@/components/ui/empty-state';
import { ListGroup, ListRow } from '@/components/ui/list';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { myAttendanceQuery, personAttendanceQuery } from './api';
import { ATTENDANCE_TONE, seesSessions } from './attendance-lib';
import { AttendanceStatusBadge, DateChip } from './components';

/** The caller's own attendance: streaks, the last twelve months and recent sessions. */
export function MyAttendancePage() {
  const { churchId, base, access } = useChurch();
  const { t } = useI18n();
  const query = useQuery(myAttendanceQuery(churchId));
  return (
    <Page size="wide">
      <PageHeader
        icon={CalendarCheck2}
        tone={ATTENDANCE_TONE}
        title={t('attendance.myHistoryTitle')}
        description={t('attendance.myHistoryDescription')}
        breadcrumbs={
          seesSessions(access)
            ? [
                { label: t('attendance.title'), to: `${base}/attendance` },
                { label: t('attendance.myHistoryTitle') },
              ]
            : undefined
        }
      />
      {query.isPending ? (
        <HistorySkeleton />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.history === null ? (
        <EmptyState
          icon={Link2Off}
          tone="warning"
          title={t('attendance.notLinkedTitle')}
          description={t('attendance.notLinkedBody')}
        />
      ) : (
        <HistoryView history={query.data.history} />
      )}
    </Page>
  );
}

/** Someone's attendance, for themselves, leaders of their groups and `attendance.view`. */
export function PersonAttendancePage() {
  const { personId = '' } = useParams<{ personId: string }>();
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const query = useQuery(personAttendanceQuery(churchId, personId));
  const name = query.data ? fullName(query.data.history.person) : '';
  return (
    <Page size="wide">
      <PageHeader
        title={query.data ? t('attendance.historyTitle', { name }) : t('attendance.title')}
        eyebrow={t('attendance.title')}
        tone={ATTENDANCE_TONE}
        breadcrumbs={[
          { label: t('attendance.title'), to: `${base}/attendance` },
          { label: name || t('attendance.title') },
        ]}
        actions={
          query.data ? (
            <EntityAvatar
              name={name}
              src={query.data.history.person.photoUrl}
              size="lg"
              className="hidden sm:flex"
            />
          ) : undefined
        }
      />
      {query.isPending ? (
        <HistorySkeleton />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <HistoryView history={query.data.history} />
      )}
    </Page>
  );
}

function HistorySkeleton() {
  return (
    <>
      <SkeletonStats count={3} />
      <SkeletonList rows={5} />
    </>
  );
}

function HistoryView({ history }: { history: AttendanceHistory }) {
  const { t, formatDate, formatDateTime, formatPercent, formatNumber } = useI18n();
  const { streak } = history;
  const absentNow = streak.currentAbsentStreak > 0;
  if (history.items.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        tone={ATTENDANCE_TONE}
        title={t('attendance.historyEmptyTitle')}
        description={t('attendance.historyEmptyBody')}
      />
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label={t('attendance.currentStreak')}
          value={formatNumber(absentNow ? streak.currentAbsentStreak : streak.currentPresentStreak)}
          hint={
            absentNow
              ? t('attendance.absentStreak', { count: streak.currentAbsentStreak })
              : t('attendance.presentStreak', { count: streak.currentPresentStreak })
          }
          icon={Flame}
          tone={absentNow ? 'danger' : 'success'}
        />
        <StatCard
          label={t('attendance.longestStreak')}
          value={formatNumber(streak.longestPresentStreak)}
          hint={t('attendance.presentStreak', { count: streak.longestPresentStreak })}
          icon={Trophy}
          tone="sun"
        />
        <StatCard
          label={t('attendance.presentRate')}
          value={formatPercent(streak.presentRate)}
          hint={t('attendance.presentRateHint')}
          icon={Percent}
          tone={ATTENDANCE_TONE}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Section title={t('attendance.lastTwelveMonths')}>
          <Card>
            <CardContent>
              <BarChart
                title={t('attendance.monthlyPresent')}
                data={history.months.map((month) => ({
                  label: formatDate(`${month.month}-01`, { options: { month: 'short' } }),
                  value: month.present,
                }))}
              />
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {t('attendance.present')}: {formatNumber(history.counts.present)}
                </span>
                <span>
                  {t('attendance.absent')}: {formatNumber(history.counts.absent)}
                </span>
                <span>
                  {t('attendance.excused')}: {formatNumber(history.counts.excused)}
                </span>
              </p>
            </CardContent>
          </Card>
        </Section>
        <Section title={t('attendance.recentSessions')}>
          <ListGroup>
            {history.items.map((item) => (
              <ListRow
                key={item.sessionId}
                leading={<DateChip value={item.sessionAt} />}
                title={item.title}
                subtitle={`${formatDateTime(item.sessionAt)} · ${item.groupName ?? t('attendance.churchWide')}${item.note ? ` · ${item.note}` : ''}`}
                trailing={<AttendanceStatusBadge status={item.status} size="sm" />}
              />
            ))}
          </ListGroup>
        </Section>
      </div>
    </>
  );
}
