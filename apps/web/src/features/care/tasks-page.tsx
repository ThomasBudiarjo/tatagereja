import {
  CARE_TASK_STATUSES,
  CARE_TASK_STATUS_LABELS,
  has,
  isCareTeam,
  localize,
  type CareTask,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ListTodo, Plus } from 'lucide-react';
import { useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { Segmented } from '@/components/ui/misc';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { tasksQuery, type TaskListParams } from './api';
import { CareNav } from './components';
import { useToday } from './helpers';
import { TaskList, TaskSheet } from './task-components';

type Group = { id: string; labelKey: MessageKey; tasks: CareTask[] };

/** Splits tasks into overdue, today, later, undated and finished, keeping the API order. */
const groupTasks = (tasks: CareTask[], today: string): Group[] => {
  const groups: Group[] = [
    { id: 'overdue', labelKey: 'care.groupOverdue', tasks: [] },
    { id: 'today', labelKey: 'care.groupToday', tasks: [] },
    { id: 'later', labelKey: 'care.groupLater', tasks: [] },
    { id: 'undated', labelKey: 'care.groupUndated', tasks: [] },
    { id: 'finished', labelKey: 'care.groupFinished', tasks: [] },
  ];
  const [overdue, dueToday, later, undated, finished] = groups as [
    Group,
    Group,
    Group,
    Group,
    Group,
  ];
  for (const task of tasks) {
    if (task.status !== 'open') finished.tasks.push(task);
    else if (!task.dueDate) undated.tasks.push(task);
    else if (task.dueDate < today) overdue.tasks.push(task);
    else if (task.dueDate === today) dueToday.tasks.push(task);
    else later.tasks.push(task);
  }
  return groups.filter((group) => group.tasks.length > 0);
};

export function TasksPage() {
  const { t, locale } = useI18n();
  const { churchId, access, base } = useChurch();
  const today = useToday();
  const team = isCareTeam(access);
  const canCreate = has(access, 'care.manage');
  const [state, setState, reset] = useUrlState({
    scope: 'mine',
    status: 'open',
    overdue: false as boolean,
    q: '',
  });
  const scope = team && state.scope === 'all' ? 'all' : 'mine';
  const params: TaskListParams = {
    scope,
    status: state.status || undefined,
    overdue: state.overdue ? 'true' : undefined,
    q: state.q || undefined,
  };
  const query = useQuery({ ...tasksQuery(churchId, params), placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<CareTask | null>(null);
  const [creating, setCreating] = useState(false);
  const filtered = !!(state.q || state.overdue || state.status !== 'open');

  return (
    <Page>
      <PageHeader
        icon={ListTodo}
        tone="rose"
        title={scope === 'mine' ? t('care.myTasks') : t('care.teamTasks')}
        description={t('care.tasksDescription')}
        breadcrumbs={[{ label: t('care.nav'), to: `${base}/care` }, { label: t('care.navTasks') }]}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              <span className="hidden sm:inline">{t('care.newTask')}</span>
              <span className="sm:hidden">{t('common.add')}</span>
            </Button>
          ) : null
        }
      />
      <CareNav />
      {team ? (
        <Segmented
          aria-label={t('care.taskScope')}
          className="sm:max-w-xs"
          value={scope}
          onChange={(value) => setState({ scope: value })}
          options={[
            { value: 'mine', label: t('care.myTasks') },
            { value: 'all', label: t('care.teamTasks') },
          ]}
        />
      ) : null}
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('care.searchTasks'),
        }}
        filters={[
          {
            id: 'status',
            label: t('care.status'),
            value: state.status,
            onChange: (status) => setState({ status }),
            options: CARE_TASK_STATUSES.map((value) => ({
              value,
              label: localize(CARE_TASK_STATUS_LABELS[value], locale),
            })),
          },
          {
            id: 'due',
            label: t('care.dueDate'),
            value: state.overdue ? 'overdue' : '',
            onChange: (value) => setState({ overdue: value === 'overdue' }),
            options: [{ value: 'overdue', label: t('care.overdueOnly') }],
          },
        ]}
        onReset={() => reset(['scope'])}
      />

      {query.isPending ? (
        <SkeletonList rows={5} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          tone="rose"
          title={filtered ? t('common.noResults') : t('care.noTasksTitle')}
          description={filtered ? t('common.noResultsHint') : t('care.noTasksDescription')}
          action={
            canCreate && !filtered ? (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t('care.newTask')}
              </Button>
            ) : null
          }
        />
      ) : (
        groupTasks(query.data.items, today).map((group) => (
          <Section key={group.id} title={`${t(group.labelKey)} · ${group.tasks.length}`}>
            <TaskList tasks={group.tasks} showAssignee={scope === 'all'} onEdit={setEditing} />
          </Section>
        ))
      )}
      <TaskSheet open={creating} onOpenChange={setCreating} />
      <TaskSheet
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        task={editing}
      />
    </Page>
  );
}
