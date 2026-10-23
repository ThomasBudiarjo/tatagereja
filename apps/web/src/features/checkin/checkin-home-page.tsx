import { DEFAULT_CHECKIN_CLASSES, type CheckinSessionDetail } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Baby,
  CalendarPlus,
  ChartColumn,
  History,
  ScanLine,
  School,
  Settings2,
  Sparkles,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart } from '@/components/ui/charts';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCards, SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ToneIcon } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { overviewQuery, useCreateDefaultClasses } from './api';
import { CHECKIN_TONE, useCheckinAccess } from './checkin-lib';
import { CheckinNav, ClassStatTile, DateTile, SessionRow, SessionStatusBadge } from './checkin-ui';
import { SessionDialog, SettingsDialog } from './session-dialogs';

/** The module home for volunteers and coordinators: what is open now and how it went. */
export function CheckinHomePage() {
  const { churchId, base } = useChurch();
  const { t, formatNumber, formatDate } = useI18n();
  const { canManage } = useCheckinAccess();
  const overview = useQuery(overviewQuery(churchId));
  const [opening, setOpening] = useState(false);
  const [settings, setSettings] = useState(false);
  const setup = useMutationToast(useCreateDefaultClasses(churchId), {
    success: (result) =>
      result.created > 0
        ? t('checkin.defaultsCreated', { count: result.created })
        : t('checkin.defaultsNothing'),
  });
  const data = overview.data;
  const needsSetup = canManage && data && data.stats.activeClasses === 0;

  return (
    <Page size="wide">
      <PageHeader
        title={t('checkin.title')}
        description={t('checkin.description')}
        icon={Baby}
        tone={CHECKIN_TONE}
        actions={
          canManage ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSettings(true)}
                aria-label={t('checkin.settingsTitle')}
              >
                <Settings2 />
                <span className="hidden sm:inline">{t('checkin.settings')}</span>
              </Button>
              <Button size="sm" onClick={() => setOpening(true)}>
                <CalendarPlus />
                <span className="hidden sm:inline">{t('checkin.openSession')}</span>
                <span className="sm:hidden">{t('checkin.openShort')}</span>
              </Button>
            </>
          ) : null
        }
      />
      <CheckinNav />

      {needsSetup ? (
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ToneIcon icon={Sparkles} tone={CHECKIN_TONE} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold tracking-tight">{t('checkin.setupTitle')}</p>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">
                {t('checkin.setupBody', {
                  classes: DEFAULT_CHECKIN_CLASSES.map((item) => item.name).join(', '),
                })}
              </p>
            </div>
            <Button loading={setup.isPending} onClick={() => void setup.run(undefined)}>
              <School />
              {t('checkin.setupAction')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {overview.isPending ? (
        <>
          <SkeletonCards count={2} />
          <SkeletonStats />
          <SkeletonList rows={3} avatar={false} />
        </>
      ) : overview.isError ? (
        <ErrorState
          error={overview.error}
          message={getErrorMessage(overview.error)}
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
        />
      ) : data ? (
        <>
          <Section title={t('checkin.openNow')} icon={ScanLine}>
            {data.openSessions.length === 0 ? (
              <EmptyState
                icon={ScanLine}
                tone={CHECKIN_TONE}
                title={t('checkin.noOpenSession')}
                description={
                  canManage ? t('checkin.noOpenSessionManage') : t('checkin.noOpenSessionOperate')
                }
                action={
                  canManage ? (
                    <Button onClick={() => setOpening(true)}>
                      <CalendarPlus />
                      {t('checkin.openSession')}
                    </Button>
                  ) : null
                }
              />
            ) : (
              <div className="flex flex-col gap-4">
                {data.openSessions.map((detail) => (
                  <OpenSessionCard key={detail.session.id} detail={detail} />
                ))}
              </div>
            )}
          </Section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t('checkin.statCheckins')}
              value={formatNumber(data.stats.checkinsLast30Days)}
              hint={t('checkin.statCheckinsHint', {
                children: formatNumber(data.stats.childrenLast30Days),
              })}
              icon={ChartColumn}
              tone={CHECKIN_TONE}
            />
            <StatCard
              label={t('checkin.statClasses')}
              value={formatNumber(data.stats.activeClasses)}
              icon={School}
              tone="sky"
              to={`${base}/checkin/classes`}
            />
            <StatCard
              label={t('checkin.statTeachers')}
              value={formatNumber(data.stats.teachers)}
              icon={UsersRound}
              tone="teal"
              to={`${base}/checkin/classes`}
            />
            <StatCard
              label={t('checkin.statAlerts')}
              value={formatNumber(data.stats.childrenWithAlerts)}
              hint={t('checkin.statAlertsHint')}
              icon={TriangleAlert}
              tone={data.stats.childrenWithAlerts > 0 ? 'rose' : 'emerald'}
              to={`${base}/checkin/children?alerts=1`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Section title={t('checkin.trendTitle')} icon={ChartColumn}>
              <Card>
                <CardContent>
                  <BarChart
                    title={t('checkin.trendTitle')}
                    data={data.trend.map((item) => ({
                      label: formatDate(item.date, 'dayMonth'),
                      value: item.count,
                    }))}
                  />
                </CardContent>
              </Card>
            </Section>
            <Section
              title={t('checkin.recentSessions')}
              icon={History}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to={`${base}/checkin/sessions`}>{t('common.seeAll')}</Link>
                </Button>
              }
            >
              {data.recentSessions.length === 0 ? (
                <EmptyState
                  compact
                  icon={History}
                  tone={CHECKIN_TONE}
                  title={t('checkin.noRecentSessions')}
                />
              ) : (
                <div className="flex flex-col gap-2.5">
                  {data.recentSessions.map((session) => (
                    <SessionRow key={session.id} session={session} />
                  ))}
                </div>
              )}
            </Section>
          </div>
        </>
      ) : null}

      {canManage ? (
        <>
          <SessionDialog open={opening} onOpenChange={setOpening} />
          <SettingsDialog open={settings} onOpenChange={setSettings} />
        </>
      ) : null}
    </Page>
  );
}

/** An open session: headcount per class, and the way into the station. */
function OpenSessionCard({ detail }: { detail: CheckinSessionDetail }) {
  const { base } = useChurch();
  const { t, formatNumber, formatDate } = useI18n();
  const { session, classes } = detail;
  const path = `${base}/checkin/sessions/${session.id}`;
  const warnings = classes.filter((item) => item.ratioExceeded).length;
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <DateTile date={session.date} />
            <div className="min-w-0">
              <Link
                to={path}
                className="block truncate text-lg font-semibold tracking-tight hover:underline"
              >
                {session.name}
              </Link>
              <p className="truncate text-sm text-muted-foreground">
                {formatDate(session.date, 'dateLong')}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <SessionStatusBadge status={session.status} />
                <span className="text-xs font-medium text-muted-foreground">
                  {t('checkin.inClassOfTotal', {
                    present: formatNumber(session.checkedInCount),
                    total: formatNumber(session.totalCount),
                  })}
                </span>
                {warnings > 0 ? (
                  <span data-tone="warning" className="text-xs font-semibold text-tone-ink">
                    · {t('checkin.ratioWarnings', { count: warnings })}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="flex-1 sm:flex-none">
              <Link to={path}>{t('checkin.viewSession')}</Link>
            </Button>
            <Button asChild className="flex-1 sm:flex-none">
              <Link to={`${path}/station`}>
                <ScanLine />
                {t('checkin.startStation')}
              </Link>
            </Button>
          </div>
        </div>
        {classes.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
            {classes.map((stat) => (
              <ClassStatTile
                key={stat.classId}
                stat={stat}
                to={`${path}/classes/${stat.classId}`}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
