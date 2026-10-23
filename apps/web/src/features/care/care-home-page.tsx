import {
  FOLLOW_UP_STAGES,
  FOLLOW_UP_STAGE_LABELS,
  canModeratePrayer,
  canViewDiakonia,
  has,
  isCareTeam,
  localize,
  type CareTask,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  ArrowRight,
  CalendarClock,
  Footprints,
  HandCoins,
  HandHeart,
  HeartHandshake,
  Inbox,
  ListTodo,
  Plus,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataList } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { ToneIcon } from '@/components/ui/status-badge';
import type { Tone } from '@/components/ui/tone';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { careOverviewQuery, tasksQuery } from './api';
import { CareNav, ConfidentialBadge, DueLabel, PriorityBadge } from './components';
import { CATEGORY_ICONS, CATEGORY_TONES, STAGE_TONES, personName } from './helpers';
import { PrayerSheet } from './prayer-components';
import { TaskList, TaskSheet } from './task-components';

function QuickLink({
  to,
  icon,
  tone,
  label,
  onClick,
}: {
  to?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  label: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <ToneIcon icon={icon} tone={tone} size="sm" />
      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{label}</span>
      <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </>
  );
  const className =
    'pressable flex min-h-14 items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-2.5 shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40';
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/** Visitor counts per stage as short bars, each a link into the board. */
function PipelineBars({ counts }: { counts: Record<(typeof FOLLOW_UP_STAGES)[number], number> }) {
  const { locale, formatNumber } = useI18n();
  const { base } = useChurch();
  const max = Math.max(1, ...FOLLOW_UP_STAGES.map((stage) => counts[stage]));
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        {FOLLOW_UP_STAGES.map((stage) => (
          <Link
            key={stage}
            to={`${base}/care/follow-ups?stage=${stage}`}
            data-tone={STAGE_TONES[stage]}
            className="group flex min-h-10 items-center gap-3 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <span className="w-32 shrink-0 truncate text-sm text-muted-foreground group-hover:text-foreground">
              {localize(FOLLOW_UP_STAGE_LABELS[stage], locale)}
            </span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-tone transition-[width] duration-500"
                style={{ width: `${(counts[stage] / max) * 100}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-sm font-semibold tabular">
              {formatNumber(counts[stage])}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export function CareHomePage() {
  const { t, formatNumber, formatCurrency } = useI18n();
  const { churchId, base, access } = useChurch();
  const overview = useQuery(careOverviewQuery(churchId));
  const myTasks = useQuery(tasksQuery(churchId, { scope: 'mine', status: 'open' }));
  const [praying, setPraying] = useState(false);
  const [editingTask, setEditingTask] = useState<CareTask | null>(null);
  const team = isCareTeam(access);
  const manager = has(access, 'care.manage');
  const moderator = canModeratePrayer(access);
  const diakonia = canViewDiakonia(access);
  const canPray = has(access, 'prayer.submit');

  return (
    <Page size="wide">
      <PageHeader
        icon={HeartHandshake}
        tone="rose"
        title={t('care.nav')}
        description={t(team ? 'care.homeDescription' : 'care.homeDescriptionMember')}
        actions={
          manager ? (
            <Button asChild className="max-sm:size-11 max-sm:px-0">
              <Link to={`${base}/care/cases/new`}>
                <Plus />
                <span className="hidden sm:inline">{t('care.newCase')}</span>
                <span className="sr-only sm:hidden">{t('care.newCase')}</span>
              </Link>
            </Button>
          ) : canPray ? (
            <Button className="max-sm:size-11 max-sm:px-0" onClick={() => setPraying(true)}>
              <Plus />
              <span className="hidden sm:inline">{t('care.newPrayer')}</span>
              <span className="sr-only sm:hidden">{t('care.newPrayer')}</span>
            </Button>
          ) : null
        }
      />
      <CareNav />

      {overview.isPending ? (
        <>
          <SkeletonStats count={4} />
          <SkeletonList rows={4} />
        </>
      ) : overview.isError ? (
        <ErrorState
          error={overview.error}
          message={getErrorMessage(overview.error)}
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {team ? (
              <>
                <StatCard
                  label={t('care.statActiveCases')}
                  value={formatNumber(overview.data.cases.active)}
                  icon={HandHeart}
                  tone="rose"
                  hint={
                    overview.data.cases.urgent > 0
                      ? t('care.statUrgentHint', { count: overview.data.cases.urgent })
                      : t('care.statMineHint', { count: overview.data.cases.mine })
                  }
                  to={`${base}/care/cases`}
                />
                <StatCard
                  label={t('care.statDue')}
                  value={formatNumber(overview.data.cases.due)}
                  icon={CalendarClock}
                  tone={overview.data.cases.due > 0 ? 'warning' : 'slate'}
                  to={`${base}/care/cases?sort=next_action`}
                />
              </>
            ) : overview.data.cases.mine > 0 ? (
              <StatCard
                label={t('care.statMyCases')}
                value={formatNumber(overview.data.cases.mine)}
                icon={HandHeart}
                tone="rose"
                to={`${base}/care/cases`}
              />
            ) : null}
            <StatCard
              label={t('care.statMyTasks')}
              value={formatNumber(overview.data.tasks.open)}
              icon={ListTodo}
              tone={overview.data.tasks.overdue > 0 ? 'danger' : 'sky'}
              hint={
                overview.data.tasks.overdue > 0
                  ? t('care.statOverdueHint', { count: overview.data.tasks.overdue })
                  : overview.data.tasks.dueToday > 0
                    ? t('care.statDueTodayHint', { count: overview.data.tasks.dueToday })
                    : undefined
              }
              to={`${base}/care/tasks`}
            />
            <StatCard
              label={t('care.statPrayer')}
              value={formatNumber(overview.data.prayer.active)}
              icon={Sparkles}
              tone="violet"
              hint={t('care.statAnsweredHint', { count: overview.data.prayer.answered })}
              to={`${base}/care/prayer`}
            />
            {moderator && overview.data.prayer.pending !== null ? (
              <StatCard
                label={t('care.statPending')}
                value={formatNumber(overview.data.prayer.pending)}
                icon={Inbox}
                tone={overview.data.prayer.pending > 0 ? 'warning' : 'slate'}
                to={`${base}/care/prayer?tab=moderation`}
              />
            ) : null}
            {overview.data.visits ? (
              <StatCard
                label={t('care.statVisitsMonth')}
                value={formatNumber(overview.data.visits.thisMonth)}
                icon={Footprints}
                tone="teal"
                hint={
                  overview.data.visits.followUpNeeded > 0
                    ? t('care.statFollowUpHint', { count: overview.data.visits.followUpNeeded })
                    : undefined
                }
                to={
                  overview.data.visits.followUpNeeded > 0
                    ? `${base}/care/visits?followUp=needed`
                    : `${base}/care/visits`
                }
              />
            ) : null}
            {diakonia && overview.data.diakonia ? (
              <StatCard
                label={t('care.statDiakoniaMonth')}
                value={formatCurrency(overview.data.diakonia.thisMonthAmount, { compact: true })}
                icon={HandCoins}
                tone="emerald"
                hint={t('care.statAidCountHint', { count: overview.data.diakonia.thisMonthCount })}
                to={`${base}/care/diakonia?period=month`}
              />
            ) : null}
          </div>

          {overview.data.tasks.overdue > 0 ? (
            <div
              data-tone="danger"
              className="flex animate-rise-in items-start gap-3 rounded-xl border border-tone/25 bg-tone-soft/60 p-3.5"
            >
              <AlarmClock className="mt-0.5 size-4 shrink-0 text-tone-ink" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-tone-ink">
                  {t('care.overdueBannerTitle', { count: overview.data.tasks.overdue })}
                </p>
                <Link
                  to={`${base}/care/tasks?overdue=1`}
                  className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                >
                  {t('care.overdueBannerAction')}
                </Link>
              </div>
            </div>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              {team || overview.data.upcoming.length > 0 ? (
                <Section
                  title={t('care.upcomingTitle')}
                  icon={CalendarClock}
                  action={
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`${base}/care/cases?sort=next_action`}>
                        {t('common.seeAll')}
                        <ArrowRight />
                      </Link>
                    </Button>
                  }
                >
                  {overview.data.upcoming.length === 0 ? (
                    <EmptyState
                      compact
                      icon={CalendarClock}
                      tone="rose"
                      title={t('care.upcomingEmptyTitle')}
                      description={t('care.upcomingEmptyDescription')}
                    />
                  ) : (
                    <DataList
                      items={overview.data.upcoming}
                      getKey={(item) => item.id}
                      href={(item) => `${base}/care/cases/${item.id}`}
                      leading={(item) => (
                        <ToneIcon
                          icon={CATEGORY_ICONS[item.category]}
                          tone={CATEGORY_TONES[item.category]}
                          size="sm"
                        />
                      )}
                      title={(item) => (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate">{item.title}</span>
                          {item.confidentiality === 'confidential' ? (
                            <ConfidentialBadge size="sm" />
                          ) : null}
                        </span>
                      )}
                      subtitle={(item) => (
                        // Wraps on phones: the due date and priority first, then the name.
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                          <DueLabel
                            date={item.nextActionDate}
                            today={overview.data.today}
                            className="whitespace-nowrap"
                          />
                          <span className="sm:hidden">
                            <PriorityBadge priority={item.priority} size="sm" quiet />
                          </span>
                          <span className="min-w-0 truncate">
                            {personName(item.person) ?? item.household?.name}
                          </span>
                        </span>
                      )}
                      trailing={(item) => (
                        <span className="max-sm:hidden">
                          <PriorityBadge priority={item.priority} size="sm" quiet />
                        </span>
                      )}
                    />
                  )}
                </Section>
              ) : null}

              <Section
                title={t('care.myTasks')}
                icon={ListTodo}
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`${base}/care/tasks`}>
                      {t('common.seeAll')}
                      <ArrowRight />
                    </Link>
                  </Button>
                }
              >
                {myTasks.isPending ? (
                  <SkeletonList rows={3} />
                ) : myTasks.isError ? (
                  <ErrorState
                    compact
                    error={myTasks.error}
                    message={getErrorMessage(myTasks.error)}
                    onRetry={() => void myTasks.refetch()}
                  />
                ) : myTasks.data.items.length === 0 ? (
                  <EmptyState
                    compact
                    icon={ListTodo}
                    tone="sky"
                    title={t('care.noOpenTasksTitle')}
                    description={t('care.noOpenTasksDescription')}
                  />
                ) : (
                  <TaskList tasks={myTasks.data.items.slice(0, 6)} onEdit={setEditingTask} />
                )}
              </Section>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              {canPray || manager || has(access, 'diakonia.manage') ? (
                <Section title={t('care.quickActions')}>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {canPray ? (
                      <QuickLink
                        icon={Sparkles}
                        tone="violet"
                        label={t('care.newPrayer')}
                        onClick={() => setPraying(true)}
                      />
                    ) : null}
                    {manager ? (
                      <>
                        <QuickLink
                          to={`${base}/care/visits/new`}
                          icon={Footprints}
                          tone="teal"
                          label={t('care.logVisit')}
                        />
                        <QuickLink
                          to={`${base}/care/follow-ups?new=1`}
                          icon={UserPlus}
                          tone="sky"
                          label={t('care.newFollowUp')}
                        />
                      </>
                    ) : null}
                    {has(access, 'diakonia.manage') ? (
                      <QuickLink
                        to={`${base}/care/diakonia?new=1`}
                        icon={HandCoins}
                        tone="emerald"
                        label={t('care.recordAid')}
                      />
                    ) : null}
                  </div>
                </Section>
              ) : null}

              {overview.data.followUps ? (
                <Section
                  title={t('care.pipelineTitle')}
                  icon={UserPlus}
                  action={
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`${base}/care/follow-ups`}>
                        {t('care.openBoard')}
                        <ArrowRight />
                      </Link>
                    </Button>
                  }
                >
                  <PipelineBars counts={overview.data.followUps} />
                </Section>
              ) : null}
            </div>
          </div>
        </>
      )}
      <PrayerSheet open={praying} onOpenChange={setPraying} />
      <TaskSheet
        open={!!editingTask}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null);
        }}
        task={editingTask}
      />
    </Page>
  );
}
