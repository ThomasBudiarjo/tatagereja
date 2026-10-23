import {
  FOLLOW_UP_STAGES,
  FOLLOW_UP_STAGE_LABELS,
  fullName,
  has,
  localize,
  type FollowUpStage,
  type VisitorFollowUp,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlarmClock, CalendarDays, ListTodo, Plus, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { KanbanBoard, KanbanCard, KanbanColumn } from '@/components/ui/kanban';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { followUpsQuery } from './api';
import { CareNav } from './components';
import { STAGE_TONES } from './helpers';
import { ContactButtons, NewFollowUpSheet, StageMenu } from './follow-up-components';
import { useStageMover } from './use-stage-mover';

function FollowUpCardBody({
  followUp,
  onMove,
}: {
  followUp: VisitorFollowUp;
  onMove: (followUp: VisitorFollowUp, stage: FollowUpStage) => void;
}) {
  const { t, formatDate } = useI18n();
  const { base } = useChurch();
  const name = fullName(followUp.person);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2.5">
        <EntityAvatar name={name} src={followUp.person.photoUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            to={`${base}/care/follow-ups/${followUp.id}`}
            className="block truncate text-sm font-semibold underline-offset-2 hover:underline"
          >
            {name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {followUp.source ?? followUp.phone ?? t('care.noSource')}
          </p>
        </div>
        <StageMenu followUp={followUp} onMove={onMove} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {followUp.firstVisitDate ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" />
            {formatDate(followUp.firstVisitDate, 'dateShort')}
          </span>
        ) : null}
        {followUp.hasOverdueTask ? (
          <StatusBadge tone="danger" size="sm" icon={AlarmClock}>
            {t('care.overdueTask')}
          </StatusBadge>
        ) : followUp.openTaskCount > 0 ? (
          <StatusBadge tone="neutral" size="sm" icon={ListTodo}>
            {t('care.openTasks', { count: followUp.openTaskCount })}
          </StatusBadge>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        {followUp.assignee ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <EntityAvatar
              name={followUp.assignee.name}
              src={followUp.assignee.avatarUrl}
              size="xs"
            />
            <span className="truncate">{followUp.assignee.name}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground italic">{t('care.unassigned')}</span>
        )}
        <ContactButtons phone={followUp.phone} size="xs" />
      </div>
    </div>
  );
}

export function FollowUpsPage() {
  const { t, locale } = useI18n();
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const canCreate = has(access, 'care.manage');
  const [state, setState, reset] = useUrlState({
    q: '',
    mine: false as boolean,
    stage: 'new',
    new: false as boolean,
  });
  const query = useQuery({
    ...followUpsQuery(churchId, {
      q: state.q || undefined,
      mine: state.mine ? 'true' : undefined,
    }),
    placeholderData: keepPreviousData,
  });
  const mover = useStageMover();
  const filtered = !!(state.q || state.mine);
  const stage = (FOLLOW_UP_STAGES as readonly string[]).includes(state.stage)
    ? (state.stage as FollowUpStage)
    : 'new';
  const byStage = (value: FollowUpStage) =>
    (query.data?.items ?? []).filter((item) => item.stage === value);
  const addButton = canCreate ? (
    <Button size="sm" onClick={() => setState({ new: true })}>
      <Plus />
      <span className="hidden sm:inline">{t('care.newFollowUp')}</span>
      <span className="sm:hidden">{t('common.add')}</span>
    </Button>
  ) : null;

  return (
    <Page size="full" className="max-w-[90rem]">
      <PageHeader
        icon={UserPlus}
        tone="sky"
        title={t('care.navFollowUps')}
        description={t('care.followUpsDescription')}
        breadcrumbs={[
          { label: t('care.nav'), to: `${base}/care` },
          { label: t('care.navFollowUps') },
        ]}
        actions={addButton}
      />
      <CareNav />
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('care.searchFollowUps'),
        }}
        filters={[
          {
            id: 'mine',
            label: t('care.followUpBy'),
            value: state.mine ? 'mine' : '',
            onChange: (value) => setState({ mine: value === 'mine' }),
            options: [{ value: 'mine', label: t('care.assignedToMe') }],
          },
        ]}
        onReset={() => reset(['stage'])}
      />
      {query.isPending ? (
        <div className="flex gap-3 overflow-hidden">
          {FOLLOW_UP_STAGES.map((value) => (
            <Skeleton key={value} className="h-72 w-[82vw] max-w-80 shrink-0 rounded-2xl sm:w-72" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 && !filtered ? (
        <EmptyState
          icon={UserPlus}
          tone="sky"
          title={t('care.noFollowUpsTitle')}
          description={t('care.noFollowUpsDescription')}
          action={addButton}
        />
      ) : (
        <>
          {/* Phones: one stage at a time, as a list. */}
          <div className="flex flex-col gap-3 md:hidden">
            <div
              role="tablist"
              aria-label={t('care.stages')}
              className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 scrollbar-none"
            >
              {FOLLOW_UP_STAGES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={stage === value}
                  data-tone={STAGE_TONES[value]}
                  onClick={() => setState({ stage: value })}
                  className={cn(
                    'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                    stage === value
                      ? 'bg-tone-soft text-tone-ink ring-1 ring-tone/40'
                      : 'bg-card text-muted-foreground ring-1 ring-border/70',
                  )}
                >
                  <span className="size-2 rounded-full bg-tone" aria-hidden />
                  {localize(FOLLOW_UP_STAGE_LABELS[value], locale)}
                  <span className="text-xs tabular opacity-80">{query.data.counts[value]}</span>
                </button>
              ))}
            </div>
            {byStage(stage).length === 0 ? (
              <EmptyState
                compact
                icon={UserPlus}
                tone={STAGE_TONES[stage]}
                title={filtered ? t('common.noResults') : t('care.columnEmpty')}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {byStage(stage).map((followUp) => (
                  <li
                    key={followUp.id}
                    className="rounded-xl border border-border/70 bg-card p-3.5 shadow-soft"
                  >
                    <FollowUpCardBody followUp={followUp} onMove={mover.moveTo} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* Tablets and desktops: the board. */}
          <KanbanBoard className="hidden md:flex">
            {FOLLOW_UP_STAGES.map((value) => {
              const items = byStage(value);
              return (
                <KanbanColumn
                  key={value}
                  title={localize(FOLLOW_UP_STAGE_LABELS[value], locale)}
                  count={query.data.counts[value]}
                  tone={STAGE_TONES[value]}
                  onDropCard={(id) => {
                    const followUp = query.data.items.find((item) => item.id === id);
                    if (followUp?.canManage) mover.moveTo(followUp, value);
                  }}
                >
                  {items.length === 0 ? (
                    <p className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border/80 text-xs text-muted-foreground">
                      {t('care.columnEmpty')}
                    </p>
                  ) : (
                    items.map((followUp) => (
                      <KanbanCard
                        key={followUp.id}
                        id={followUp.id}
                        draggable={followUp.canManage}
                        onDoubleClick={() => navigate(`${base}/care/follow-ups/${followUp.id}`)}
                      >
                        <FollowUpCardBody followUp={followUp} onMove={mover.moveTo} />
                      </KanbanCard>
                    ))
                  )}
                </KanbanColumn>
              );
            })}
          </KanbanBoard>
          {canCreate ? (
            <p className="hidden text-xs text-muted-foreground md:block">{t('care.boardHint')}</p>
          ) : null}
        </>
      )}
      {mover.dialog}
      <NewFollowUpSheet
        open={canCreate && state.new}
        onOpenChange={(open) => setState({ new: open })}
      />
    </Page>
  );
}
