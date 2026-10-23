import {
  FOLLOW_UP_STAGE_LABELS,
  PERSON_STATUS_TEXT,
  fullName,
  has,
  localize,
  type CareTask,
  type FollowUpStage,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  ListTodo,
  Mail,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Stepper } from '@/components/ui/stepper';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { followUpQuery, tasksQuery, useApplyFollowUpStatus, useDeleteFollowUp } from './api';
import { StageBadge } from './components';
import { ContactButtons, EditFollowUpSheet, StageMenu } from './follow-up-components';
import { useStageMover } from './use-stage-mover';
import { TaskList, TaskSheet } from './task-components';

const PATH: FollowUpStage[] = ['new', 'contacted', 'visited', 'joined'];

export function FollowUpPage() {
  const { t, locale, formatDate, formatRelative } = useI18n();
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const { followUpId = '' } = useParams();
  const query = useQuery(followUpQuery(churchId, followUpId));
  const tasks = useQuery({ ...tasksQuery(churchId, { followUpId }), enabled: query.isSuccess });
  const mover = useStageMover();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<CareTask | null>(null);
  const remove = useMutationToast(useDeleteFollowUp(churchId), {
    success: t('care.followUpDeleted'),
  });
  const applyStatus = useMutationToast(useApplyFollowUpStatus(churchId), {
    success: (data) => t('care.statusApplied', { name: fullName(data.followUp.person) }),
  });
  const crumbs = [
    { label: t('care.nav'), to: `${base}/care` },
    { label: t('care.navFollowUps'), to: `${base}/care/follow-ups` },
  ];

  if (query.isPending) {
    return (
      <Page>
        <PageHeader title={t('care.followUpDetail')} breadcrumbs={crumbs} documentTitle={false} />
        <SkeletonText lines={5} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('care.followUpDetail')} breadcrumbs={crumbs} />
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </Page>
    );
  }
  const followUp = query.data.followUp;
  const name = fullName(followUp.person);
  const pathIndex = PATH.indexOf(followUp.stage);
  const next = pathIndex >= 0 && pathIndex < PATH.length - 1 ? PATH[pathIndex + 1] : undefined;

  return (
    <Page>
      <PageHeader
        icon={UserPlus}
        tone="sky"
        eyebrow={t('care.navFollowUps')}
        title={name}
        breadcrumbs={[...crumbs, { label: name }]}
        actions={
          followUp.canManage ? (
            <>
              <Button
                variant="outline"
                className="max-sm:size-11 max-sm:px-0"
                onClick={() => setEditing(true)}
              >
                <Pencil />
                <span className="hidden sm:inline">{t('common.edit')}</span>
                <span className="sr-only sm:hidden">{t('common.edit')}</span>
              </Button>
              {has(access, 'care.manage') ? (
                <Button
                  variant="outline"
                  size="icon-lg"
                  aria-label={t('care.deleteFollowUp')}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      <Card className="animate-rise-in">
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <EntityAvatar name={name} src={followUp.person.photoUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StageBadge stage={followUp.stage} />
                  <span className="text-xs text-muted-foreground">
                    {t('care.inStageSince', { time: formatRelative(followUp.stageChangedAt) })}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {[followUp.phone, followUp.email].filter(Boolean).join(' · ') ||
                    t('care.noContact')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ContactButtons phone={followUp.phone} />
              {followUp.email ? (
                <Button asChild variant="outline" size="sm">
                  <a href={`mailto:${followUp.email}`}>
                    <Mail />
                    {t('care.email')}
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
          {followUp.stage === 'closed' ? (
            <Alert variant="info" title={t('care.followUpClosed')}>
              {followUp.closedReason}
            </Alert>
          ) : (
            <Stepper
              steps={PATH.map((stage) => ({
                id: stage,
                label: localize(FOLLOW_UP_STAGE_LABELS[stage], locale),
              }))}
              current={Math.max(0, pathIndex)}
            />
          )}
          {followUp.statusSuggestion ? (
            <Alert
              variant={followUp.canChangeStatus ? 'success' : 'info'}
              title={t('care.statusSuggestionTitle', {
                status: localize(PERSON_STATUS_TEXT[followUp.statusSuggestion], locale),
              })}
              action={
                followUp.canChangeStatus ? (
                  <Button
                    size="sm"
                    loading={applyStatus.isPending}
                    onClick={() => void applyStatus.run(followUp.id)}
                  >
                    <BadgeCheck />
                    {t('care.applyStatus')}
                  </Button>
                ) : null
              }
            >
              {followUp.canChangeStatus
                ? t('care.statusSuggestionCan', { name })
                : t('care.statusSuggestionCannot', { name })}
            </Alert>
          ) : null}
          {followUp.canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              {next ? (
                <Button
                  size="sm"
                  loading={mover.isPending}
                  onClick={() => mover.moveTo(followUp, next)}
                >
                  <ArrowRight />
                  {t('care.moveToStage', { stage: localize(FOLLOW_UP_STAGE_LABELS[next], locale) })}
                </Button>
              ) : null}
              <StageMenu followUp={followUp} onMove={mover.moveTo} size="sm" />
            </div>
          ) : null}
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-overline text-muted-foreground">{t('care.firstVisit')}</dt>
              <dd className="mt-1 font-medium">
                {formatDate(followUp.firstVisitDate, 'dateLong')}
              </dd>
            </div>
            <div>
              <dt className="text-overline text-muted-foreground">{t('care.source')}</dt>
              <dd className="mt-1 font-medium">{followUp.source ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-overline text-muted-foreground">{t('care.followUpBy')}</dt>
              <dd className="mt-1 font-medium">
                {followUp.assignee ? (
                  <span className="inline-flex items-center gap-1.5">
                    <EntityAvatar
                      name={followUp.assignee.name}
                      src={followUp.assignee.avatarUrl}
                      size="xs"
                    />
                    {followUp.assignee.name}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t('care.unassigned')}</span>
                )}
              </dd>
            </div>
          </dl>
          {followUp.notes ? (
            <div>
              <p className="text-overline text-muted-foreground">{t('care.notes')}</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-pretty">{followUp.notes}</p>
            </div>
          ) : null}
          <Button asChild variant="link" className="h-auto w-fit p-0">
            <Link to={`${base}/people/${followUp.person.id}`}>{t('care.openProfile')}</Link>
          </Button>
        </CardContent>
      </Card>

      <Section
        title={t('care.followUpTasks')}
        icon={ListTodo}
        action={
          followUp.canManage && tasks.data?.items.length ? (
            <Button size="sm" variant="outline" onClick={() => setCreatingTask(true)}>
              <Plus />
              {t('care.newTask')}
            </Button>
          ) : null
        }
      >
        {tasks.isPending ? (
          <SkeletonList rows={2} />
        ) : tasks.isError ? (
          <ErrorState
            compact
            error={tasks.error}
            message={getErrorMessage(tasks.error)}
            onRetry={() => void tasks.refetch()}
          />
        ) : tasks.data.items.length === 0 ? (
          <EmptyState
            compact
            icon={ListTodo}
            tone="sky"
            title={t('care.noFollowUpTasksTitle')}
            description={t('care.noFollowUpTasksDescription')}
            action={
              followUp.canManage ? (
                <Button size="sm" onClick={() => setCreatingTask(true)}>
                  <Plus />
                  {t('care.newTask')}
                </Button>
              ) : null
            }
          />
        ) : (
          <TaskList tasks={tasks.data.items} showAssignee onEdit={setEditingTask} />
        )}
      </Section>

      {mover.dialog}
      <EditFollowUpSheet followUp={followUp} open={editing} onOpenChange={setEditing} />
      <TaskSheet
        open={creatingTask}
        onOpenChange={setCreatingTask}
        context={{ followUpId: followUp.id }}
      />
      <TaskSheet
        open={!!editingTask}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null);
        }}
        task={editingTask}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('care.deleteFollowUpTitle')}
        description={t('care.deleteFollowUpDescription', { name })}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(followUp.id)) navigate(`${base}/care/follow-ups`, { replace: true });
        }}
      />
    </Page>
  );
}
