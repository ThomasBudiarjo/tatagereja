import {
  ABSENCE_ALERT_STATUS_LABELS,
  INSIGHTS_LIMITS,
  can,
  fullName,
  localize,
  resolveAbsenceAlertBodySchema,
  type AbsenceAlert,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  BellRing,
  CalendarClock,
  ClipboardList,
  HandHeart,
  History,
  PartyPopper,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FilterBar } from '@/components/ui/filter-bar';
import { Input, Textarea } from '@/components/ui/input';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { careTeamQuery } from '@/features/care/api';
import { groupsQuery } from '@/features/groups/api';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { absencesQuery, useResolveAbsence } from './api';

const THRESHOLDS = [2, 3, 4, 6, 8] as const;

/** People absent from several sessions in a row, with dismiss and care follow-up. */
export function AbsencesPage() {
  const { churchId, base, access } = useChurch();
  const { t } = useI18n();
  const [state, setState, reset] = useUrlState({
    q: '',
    threshold: INSIGHTS_LIMITS.absentStreakDefault as number,
    groupId: '',
    resolved: false as boolean,
  });
  const groups = useQuery(groupsQuery(churchId, { includeInactive: true }));
  const query = useQuery({
    ...absencesQuery(churchId, {
      q: state.q || undefined,
      threshold: state.threshold,
      groupId: state.groupId || undefined,
      includeResolved: state.resolved,
    }),
    placeholderData: keepPreviousData,
  });
  const [following, setFollowing] = useState<AbsenceAlert | null>(null);
  const [dismissing, setDismissing] = useState<AbsenceAlert | null>(null);
  const resolve = useResolveAbsence(churchId);
  const dismiss = useMutationToast(resolve, { success: t('attendance.dismissed') });
  const reopen = useMutationToast(resolve, { success: t('attendance.reopened') });

  const groupOptions = (groups.data?.items ?? [])
    .filter((group) => can.viewAllAttendance(access) || access.leaderGroupIds.includes(group.id))
    .map((group) => ({ value: group.id, label: group.name }));

  return (
    <Page size="wide">
      <PageHeader
        icon={BellRing}
        tone="rose"
        title={t('attendance.absencesTitle')}
        description={t('attendance.absencesDescription')}
        breadcrumbs={[
          { label: t('attendance.title'), to: `${base}/attendance` },
          { label: t('attendance.absences') },
        ]}
      />
      <FilterBar
        search={{ value: state.q, onChange: (q) => setState({ q }) }}
        filters={[
          {
            id: 'threshold',
            label: t('attendance.threshold'),
            value: String(state.threshold),
            onChange: (value) =>
              setState({ threshold: Number(value) || INSIGHTS_LIMITS.absentStreakDefault }),
            options: THRESHOLDS.map((count) => ({
              value: String(count),
              label: t('attendance.thresholdOption', { count }),
            })),
          },
          {
            id: 'group',
            label: t('attendance.filterGroup'),
            value: state.groupId,
            onChange: (groupId) => setState({ groupId }),
            options: groupOptions,
          },
          {
            id: 'resolved',
            label: t('attendance.includeResolved'),
            value: state.resolved ? 'yes' : '',
            onChange: (value) => setState({ resolved: value === 'yes' }),
            options: [{ value: 'yes', label: t('common.yes') }],
          },
        ]}
        onReset={() => reset()}
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
          icon={PartyPopper}
          tone="success"
          title={t('attendance.absencesEmptyTitle')}
          description={t('attendance.absencesEmptyBody', { count: query.data.threshold })}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {query.data.items.map((alert) => (
            <AlertCard
              key={alert.person.id}
              alert={alert}
              canFollowUp={query.data.canFollowUp}
              onFollowUp={() => setFollowing(alert)}
              onDismiss={() => setDismissing(alert)}
              onReopen={() => void reopen.run({ personId: alert.person.id, action: 'reopen' })}
              reopening={reopen.isPending && resolve.variables?.personId === alert.person.id}
            />
          ))}
        </ul>
      )}

      <FollowUpDialog alert={following} onClose={() => setFollowing(null)} />
      <ConfirmDialog
        open={!!dismissing}
        onOpenChange={(open) => (!open ? setDismissing(null) : undefined)}
        title={t('attendance.dismissTitle', {
          name: dismissing ? fullName(dismissing.person) : '',
        })}
        description={t('attendance.dismissBody', {
          name: dismissing ? fullName(dismissing.person) : '',
        })}
        confirmLabel={t('attendance.dismiss')}
        loading={dismiss.isPending}
        onConfirm={async () => {
          if (!dismissing) return;
          if (await dismiss.run({ personId: dismissing.person.id, action: 'dismiss' })) {
            setDismissing(null);
          }
        }}
      />
    </Page>
  );
}

function AlertCard({
  alert,
  canFollowUp,
  onFollowUp,
  onDismiss,
  onReopen,
  reopening,
}: {
  alert: AbsenceAlert;
  canFollowUp: boolean;
  onFollowUp: () => void;
  onDismiss: () => void;
  onReopen: () => void;
  reopening: boolean;
}) {
  const { base } = useChurch();
  const { t, locale, formatDate } = useI18n();
  const name = fullName(alert.person);
  const open = alert.status === 'open';
  const severe = alert.streak >= 6;
  const streak = (
    <StatusBadge tone={severe ? 'danger' : 'warning'} icon={CalendarClock}>
      {t('attendance.streak', { count: alert.streak })}
    </StatusBadge>
  );
  // Phones give each action half a row (the follow-up a whole one) so long names keep room.
  const action = 'max-sm:min-w-[40%] max-sm:flex-1';
  return (
    <li className="flex min-w-0 animate-rise-in flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <EntityAvatar name={name} src={alert.person.photoUrl} />
        <div className="min-w-0 flex-1">
          <Link
            to={`${base}/people/${alert.person.id}`}
            className="block truncate font-semibold hover:underline"
          >
            {name}
          </Link>
          <p className="text-sm text-muted-foreground">
            {alert.lastPresentAt
              ? t('attendance.lastPresent', { date: formatDate(alert.lastPresentAt, 'dateShort') })
              : t('attendance.neverPresent')}
          </p>
        </div>
        <div className="hidden shrink-0 sm:block">{streak}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="sm:hidden">{streak}</div>
        {!open ? (
          <StatusBadge tone={alert.status === 'followed_up' ? 'success' : 'neutral'} dot>
            {localize(ABSENCE_ALERT_STATUS_LABELS[alert.status], locale)}
          </StatusBadge>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {t('attendance.lastAbsent', { date: formatDate(alert.lastAbsentAt, 'dateShort') })}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3 sm:justify-end">
        <Button asChild variant="ghost" size="sm" className={action}>
          <Link to={`${base}/attendance/people/${alert.person.id}`}>
            <History />
            {t('attendance.viewHistory')}
          </Link>
        </Button>
        {open ? (
          <>
            <Button variant="outline" size="sm" className={action} onClick={onDismiss}>
              <XCircle />
              {t('attendance.dismiss')}
            </Button>
            {canFollowUp ? (
              <Button size="sm" className={action} onClick={onFollowUp}>
                <HandHeart />
                {t('attendance.followUp')}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            {alert.careTaskId ? (
              <Button asChild variant="outline" size="sm" className={action}>
                <Link to={`${base}/care/tasks`}>
                  <ClipboardList />
                  {t('attendance.viewTask')}
                </Link>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className={action}
              onClick={onReopen}
              loading={reopening}
            >
              {!reopening ? <RotateCcw /> : null}
              {t('attendance.reopen')}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

type FollowUpForm = z.input<typeof resolveAbsenceAlertBodySchema>;

function FollowUpDialog({ alert, onClose }: { alert: AbsenceAlert | null; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog open={!!alert} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        {alert ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('attendance.followUpTitle', { name: fullName(alert.person) })}
              </DialogTitle>
              <DialogDescription>
                {t('attendance.followUpDescription', {
                  name: fullName(alert.person),
                  count: alert.streak,
                })}
              </DialogDescription>
            </DialogHeader>
            <FollowUpForm alert={alert} onDone={onClose} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FollowUpForm({ alert, onDone }: { alert: AbsenceAlert; onDone: () => void }) {
  const { churchId, access } = useChurch();
  const { t } = useI18n();
  const team = useQuery(careTeamQuery(churchId, 'team'));
  const form = useForm<FollowUpForm, unknown, z.output<typeof resolveAbsenceAlertBodySchema>>({
    resolver: zodResolver(resolveAbsenceAlertBodySchema),
    defaultValues: { action: 'follow_up', assignedUserId: access.userId, dueDate: null, note: '' },
  });
  const errors = form.formState.errors;
  const create = useMutationToast(useResolveAbsence(churchId), {
    success: t('attendance.followedUp'),
    form,
  });
  const options = [
    { value: access.userId, label: t('attendance.assigneeMe') },
    ...(team.data?.items ?? [])
      .filter((member) => member.userId !== access.userId)
      .map((member) => ({
        value: member.userId,
        label: member.name,
        leading: <EntityAvatar name={member.name} src={member.avatarUrl} size="xs" />,
      })),
  ];
  const submit = form.handleSubmit(async (values) => {
    if (await create.run({ ...values, personId: alert.person.id })) onDone();
  });
  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex min-h-0 flex-col gap-4"
    >
      <DialogBody className="flex flex-col gap-4">
        <Field
          label={t('attendance.assignee')}
          htmlFor="follow-assignee"
          error={errors.assignedUserId?.message}
        >
          <Controller
            control={form.control}
            name="assignedUserId"
            render={({ field }) => (
              <Combobox
                id="follow-assignee"
                options={options}
                value={field.value ?? null}
                onChange={field.onChange}
                loading={team.isPending}
              />
            )}
          />
        </Field>
        <Field label={t('attendance.dueDate')} htmlFor="follow-due" error={errors.dueDate?.message}>
          <Controller
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <Input
                id="follow-due"
                type="date"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
              />
            )}
          />
        </Field>
        <Field label={t('attendance.note')} htmlFor="follow-note" error={errors.note?.message}>
          <Textarea
            id="follow-note"
            rows={3}
            autoFocus
            placeholder={t('attendance.notePlaceholder')}
            {...form.register('note')}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={create.isPending}>
          <HandHeart />
          {t('attendance.createFollowUp')}
        </Button>
      </DialogFooter>
    </form>
  );
}
