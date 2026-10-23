import { careTaskInputSchema, has, type CareTask, type CareTaskInput } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, Check, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { RowActions } from '@/components/ui/row-actions';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { useDeleteTask, useSaveTask, useSetTaskStatus } from './api';
import { DueLabel, MemberCombobox, PersonCombobox } from './components';
import { personName, useToday } from './helpers';

type TaskFormValues = z.input<typeof careTaskInputSchema>;

/** Where a new task belongs; the person defaults to the case or visitor on the server. */
export type TaskContext = { caseId?: string; followUpId?: string };

/** Creates or edits a follow-up task in a bottom sheet (side panel on wide screens). */
export function TaskSheet({
  open,
  onOpenChange,
  task,
  context,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: CareTask | null;
  context?: TaskContext;
}) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{task ? t('care.editTask') : t('care.newTask')}</SheetTitle>
          <SheetDescription>{t('care.taskSheetDescription')}</SheetDescription>
        </SheetHeader>
        {open ? (
          <TaskForm
            key={task?.id ?? 'new'}
            task={task ?? undefined}
            context={context}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function TaskForm({
  task,
  context,
  onDone,
}: {
  task?: CareTask;
  context?: TaskContext;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { churchId, access } = useChurch();
  const linked = !!(task?.caseId || task?.followUpId || context?.caseId || context?.followUpId);
  const form = useForm<TaskFormValues, unknown, CareTaskInput>({
    resolver: zodResolver(careTaskInputSchema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      dueDate: task?.dueDate ?? '',
      assignedUserId: task?.assignee?.userId ?? null,
      personId: task?.person?.id ?? null,
      caseId: task ? task.caseId : (context?.caseId ?? null),
      followUpId: task ? task.followUpId : (context?.followUpId ?? null),
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useSaveTask(churchId), {
    success: task ? t('care.taskSaved') : t('care.taskCreated'),
    form,
  });
  const onSubmit = form.handleSubmit(async (values) => {
    const body = task
      ? {
          id: task.id,
          title: values.title,
          description: values.description,
          dueDate: values.dueDate,
          assignedUserId: values.assignedUserId,
          personId: values.personId,
        }
      : values;
    if (await save.run(body)) onDone();
  });

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <SheetBody className="flex flex-col gap-4">
        <Field
          label={t('care.taskTitle')}
          htmlFor="task-title"
          error={errors.title?.message}
          required
        >
          <Input
            id="task-title"
            autoFocus
            placeholder={t('care.taskTitlePlaceholder')}
            aria-invalid={!!errors.title}
            {...form.register('title')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('care.dueDate')} htmlFor="task-due" error={errors.dueDate?.message}>
            <Input
              id="task-due"
              type="date"
              aria-invalid={!!errors.dueDate}
              {...form.register('dueDate')}
            />
          </Field>
          <Controller
            control={form.control}
            name="assignedUserId"
            render={({ field }) => (
              <Field
                label={t('care.assignTo')}
                htmlFor="task-assignee"
                error={errors.assignedUserId?.message}
                description={field.value ? undefined : t('care.assignToMeHint')}
              >
                <MemberCombobox
                  id="task-assignee"
                  everyone={has(access, 'care.manage')}
                  value={field.value ?? null}
                  onChange={field.onChange}
                  invalid={!!errors.assignedUserId}
                />
              </Field>
            )}
          />
        </div>
        {!linked ? (
          <Controller
            control={form.control}
            name="personId"
            render={({ field }) => (
              <Field
                label={t('care.taskPerson')}
                htmlFor="task-person"
                error={errors.personId?.message}
              >
                <PersonCombobox
                  id="task-person"
                  value={field.value ?? null}
                  selected={task?.person}
                  onChange={(value) => field.onChange(value)}
                />
              </Field>
            )}
          />
        ) : null}
        <Field
          label={t('care.taskDescription')}
          htmlFor="task-description"
          error={errors.description?.message}
        >
          <Textarea id="task-description" rows={3} {...form.register('description')} />
        </Field>
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {task ? t('common.saveChanges') : t('care.newTask')}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** One task: a round check to tick it off, its context, due date and actions. */
export function TaskRow({
  task,
  showAssignee = false,
  onEdit,
}: {
  task: CareTask;
  showAssignee?: boolean;
  onEdit?: (task: CareTask) => void;
}) {
  const { t, formatDate } = useI18n();
  const { churchId, base } = useChurch();
  const today = useToday();
  const setStatus = useMutationToast(useSetTaskStatus(churchId), {
    success: (_data, variables) =>
      variables.status === 'done' ? t('care.taskDone') : t('care.taskReopened'),
  });
  const remove = useMutationToast(useDeleteTask(churchId), { success: t('care.taskDeleted') });
  const [confirming, setConfirming] = useState(false);
  const done = task.status === 'done';
  const cancelled = task.status === 'cancelled';
  const person = personName(task.person);
  const context = task.caseTitle
    ? {
        label: t('care.forCase', { title: task.caseTitle }),
        to: `${base}/care/cases/${task.caseId}`,
      }
    : task.followUpId
      ? {
          label: t('care.forVisitor', { name: person ?? '—' }),
          to: `${base}/care/follow-ups/${task.followUpId}`,
        }
      : person
        ? { label: person, to: task.person ? `${base}/people/${task.person.id}` : undefined }
        : null;

  return (
    <li
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors',
        task.isOverdue && 'bg-destructive/[0.035]',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? t('care.reopenTask') : t('care.markDone')}
        disabled={!task.canComplete || cancelled}
        onClick={() => void setStatus.run({ id: task.id, status: done ? 'open' : 'done' })}
        className={cn(
          'relative -m-2 flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-full border-2 transition-all duration-200',
            done
              ? 'border-success bg-success text-success-foreground'
              : task.isOverdue
                ? 'border-destructive/70'
                : 'border-muted-foreground/40 hover:border-primary',
          )}
        >
          {done ? <Check className="size-3.5 animate-in zoom-in-50" strokeWidth={3} /> : null}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-medium text-pretty',
            (done || cancelled) &&
              'text-muted-foreground line-through decoration-muted-foreground/50',
          )}
        >
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {done && task.completedAt ? (
            <span>
              {t('care.completedOn', { date: formatDate(task.completedAt, 'dateShort') })}
            </span>
          ) : cancelled ? (
            <span>{t('care.taskCancelled')}</span>
          ) : (
            <DueLabel date={task.dueDate} today={today} />
          )}
          {context ? (
            context.to ? (
              <Link
                to={context.to}
                className="truncate underline-offset-2 hover:text-foreground hover:underline"
              >
                {context.label}
              </Link>
            ) : (
              <span className="truncate">{context.label}</span>
            )
          ) : null}
          {task.caseId && !task.caseTitle ? <span>{t('care.confidentialCaseTask')}</span> : null}
        </div>
        {task.description && !done ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
        ) : null}
      </div>
      {showAssignee && task.assignee ? (
        <EntityAvatar
          name={task.assignee.name}
          src={task.assignee.avatarUrl}
          size="xs"
          className="mt-1"
        />
      ) : null}
      <RowActions
        label={t('care.taskActions', { title: task.title })}
        actions={[
          {
            id: 'edit',
            label: t('common.edit'),
            icon: Pencil,
            hidden: !task.canEdit || !onEdit,
            onSelect: () => onEdit?.(task),
          },
          {
            id: 'cancel',
            label: cancelled ? t('care.reopenTask') : t('care.cancelTask'),
            icon: cancelled ? RotateCcw : Ban,
            hidden: !task.canComplete || done,
            onSelect: () =>
              void setStatus.run({ id: task.id, status: cancelled ? 'open' : 'cancelled' }),
          },
          {
            id: 'delete',
            label: t('common.delete'),
            icon: Trash2,
            destructive: true,
            hidden: !task.canEdit,
            onSelect: () => setConfirming(true),
          },
        ]}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('care.deleteTaskTitle')}
        description={t('care.deleteTaskDescription', { title: task.title })}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(task.id)) setConfirming(false);
        }}
      />
    </li>
  );
}

/** A grouped card of task rows. */
export function TaskList({
  tasks,
  showAssignee,
  onEdit,
  className,
}: {
  tasks: CareTask[];
  showAssignee?: boolean;
  onEdit?: (task: CareTask) => void;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        'divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft',
        className,
      )}
    >
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} showAssignee={showAssignee} onEdit={onEdit} />
      ))}
    </ul>
  );
}
