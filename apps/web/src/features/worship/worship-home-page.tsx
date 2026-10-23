import { canManageServices, fullName, has } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  CalendarPlus,
  CircleX,
  Hourglass,
  ListMusic,
  Music,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ToneIcon } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { overviewQuery, useSetupWorship } from './api';
import { ScheduleCard } from './respond';
import { ConflictBadges, RosterStatusBadge, ServiceRow, WorshipNav } from './worship-ui';
import { WORSHIP_TONE, useWorshipMe } from './worship-lib';

/** The module home: what is coming, what needs a reply and what needs fixing. */
export function WorshipHomePage() {
  const { churchId, base, access } = useChurch();
  const { t, formatNumber, formatDate } = useI18n();
  const overview = useQuery(overviewQuery(churchId));
  const me = useWorshipMe();
  const canManage = canManageServices(access);
  const setup = useMutationToast(useSetupWorship(churchId), {
    success: (result) =>
      result.serviceTypes + result.teams > 0
        ? t('worship.setupDone', { types: result.serviceTypes, teams: result.teams })
        : t('worship.setupNothing'),
  });
  const schedules = has(access, 'volunteers.schedule') || (me.data?.ledTeamIds.length ?? 0) > 0;

  const data = overview.data;
  const pending = me.data?.pendingCount ?? 0;
  const needsSetup = canManage && data && data.stats.teams === 0 && data.upcoming.length === 0;

  return (
    <Page size="wide">
      <PageHeader
        title={t('worship.title')}
        description={t('worship.description')}
        icon={Music}
        tone={WORSHIP_TONE}
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link to={`${base}/worship/services/new`}>
                <CalendarPlus />
                <span className="hidden sm:inline">{t('worship.planService')}</span>
                <span className="sm:hidden">{t('common.add')}</span>
              </Link>
            </Button>
          ) : null
        }
      />
      <WorshipNav />

      {pending > 0 ? (
        <Alert
          variant="warning"
          title={t('worship.pendingBanner', { count: pending })}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to={`${base}/worship/me`}>{t('worship.reply')}</Link>
            </Button>
          }
        />
      ) : null}

      {needsSetup ? (
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ToneIcon icon={Sparkles} tone={WORSHIP_TONE} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold tracking-tight">{t('worship.setupTitle')}</p>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">
                {t('worship.setupBody')}
              </p>
            </div>
            <Button loading={setup.isPending} onClick={() => void setup.run(undefined)}>
              {t('worship.setupAction')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {overview.isPending ? (
        <>
          <SkeletonStats />
          <SkeletonList rows={4} avatar={false} />
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t('worship.upcomingServices')}
              value={formatNumber(data.stats.upcomingServices)}
              hint={t('worship.upcomingServicesHint')}
              icon={CalendarCheck}
              tone={WORSHIP_TONE}
              to={`${base}/worship/services`}
            />
            {schedules ? (
              <StatCard
                label={t('worship.openPositions')}
                value={formatNumber(data.stats.openPositions)}
                hint={t('worship.openPositionsHint')}
                icon={UsersRound}
                tone={data.stats.openPositions > 0 ? 'amber' : 'emerald'}
              />
            ) : (
              <StatCard
                label={t('worship.songsCount')}
                value={formatNumber(data.stats.songs)}
                icon={ListMusic}
                tone="sky"
                to={`${base}/worship/songs`}
              />
            )}
            <StatCard
              label={t('worship.pendingReplies')}
              value={formatNumber(data.stats.pendingResponses)}
              icon={Hourglass}
              tone="amber"
              to={schedules ? undefined : `${base}/worship/me`}
            />
            <StatCard
              label={t('worship.declinedCount')}
              value={formatNumber(data.stats.declined)}
              icon={CircleX}
              tone={data.stats.declined > 0 ? 'rose' : 'emerald'}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Section
              title={t('worship.upcomingServices')}
              icon={CalendarCheck}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to={`${base}/worship/services`}>{t('common.seeAll')}</Link>
                </Button>
              }
            >
              {data.upcoming.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  tone={WORSHIP_TONE}
                  title={t('worship.noUpcoming')}
                  description={
                    canManage ? t('worship.noUpcomingManage') : t('worship.noUpcomingView')
                  }
                  action={
                    canManage ? (
                      <Button asChild>
                        <Link to={`${base}/worship/services/new`}>
                          <CalendarPlus />
                          {t('worship.planService')}
                        </Link>
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <div className="flex flex-col gap-2.5">
                  {data.upcoming.map((service) => (
                    <ServiceRow key={service.id} service={service} />
                  ))}
                </div>
              )}
            </Section>

            <div className="flex min-w-0 flex-col gap-6">
              {me.data?.personId ? (
                <Section
                  title={t('worship.myNext')}
                  icon={UserRoundCheck}
                  action={
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`${base}/worship/me`}>{t('common.seeAll')}</Link>
                    </Button>
                  }
                >
                  {data.mySchedule.length === 0 ? (
                    <EmptyState
                      compact
                      icon={UserRoundCheck}
                      tone={WORSHIP_TONE}
                      title={t('worship.notServingSoon')}
                    />
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {data.mySchedule.map((item) => (
                        <ScheduleCard key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </Section>
              ) : null}

              {schedules ? (
                <Section
                  title={t('worship.needsAttention')}
                  description={t('worship.needsAttentionHint')}
                  icon={CircleX}
                >
                  {data.attention.length === 0 ? (
                    <EmptyState
                      compact
                      icon={UserRoundCheck}
                      tone="success"
                      title={t('worship.allGood')}
                    />
                  ) : (
                    <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
                      {data.attention.map((item) => (
                        <li key={item.id}>
                          <Link
                            to={`${base}/worship/services/${item.serviceId}?tab=roster`}
                            className="flex min-w-0 flex-col gap-1.5 px-4 py-3 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
                          >
                            <span className="flex min-w-0 items-center justify-between gap-2">
                              <span className="truncate font-medium">{fullName(item.person)}</span>
                              <RosterStatusBadge status={item.status} />
                            </span>
                            <span className="truncate text-sm text-muted-foreground">
                              {item.positionName} · {item.serviceTitle} ·{' '}
                              {formatDate(item.serviceStartsAt, 'dayMonth')}
                            </span>
                            <ConflictBadges conflicts={item.conflicts} hideDeclined />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </Page>
  );
}
