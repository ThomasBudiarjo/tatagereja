import {
  ATTENDANCE_MODES,
  ATTENDANCE_MODE_LABELS,
  attendanceSessionInputSchema,
  can,
  localize,
  type AttendanceMode,
  type AttendanceSessionView,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BellRing, ClipboardCheck, ClipboardList, Plus, UserRoundCheck, Users } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { DateTimeInput } from '@/components/ui/date-time-input';
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
import { ListGroup, ListRow } from '@/components/ui/list';
import { Segmented } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { groupsQuery } from '@/features/groups/api';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { attendanceSessionsQuery, useCreateAttendanceSession } from './api';
import { ATTENDANCE_TONE, canStartSession, seesAbsences, seesSessions } from './attendance-lib';
import { DateChip, MarkBar } from './components';
import { MyAttendancePage } from './history-page';

const PAGE_SIZE = 25;

/** Sessions the caller oversees; members without attendance access see their own history. */
export function AttendancePage() {
  const { access } = useChurch();
  return seesSessions(access) ? <SessionsPage /> : <MyAttendancePage />;
}

function SessionsPage() {
  const { churchId, base, access } = useChurch();
  const { t, locale } = useI18n();
  const [state, setState, reset] = useUrlState({
    q: '',
    groupId: '',
    mode: '',
    sort: 'recent',
    page: 1,
    new: false as boolean,
  });
  const groups = useQuery(groupsQuery(churchId, { includeInactive: true }));
  const query = useQuery({
    ...attendanceSessionsQuery(churchId, {
      q: state.q || undefined,
      groupId: state.groupId || undefined,
      mode: (state.mode || undefined) as AttendanceMode | undefined,
      sort: state.sort as 'recent' | 'oldest' | 'title',
      page: state.page,
      limit: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });
  const canCreate = canStartSession(access);
  const filtered = !!(state.q || state.groupId || state.mode);
  const groupOptions = (groups.data?.items ?? [])
    .filter((group) => can.viewAllAttendance(access) || access.leaderGroupIds.includes(group.id))
    .map((group) => ({ value: group.id, label: group.name }));

  return (
    <Page size="wide">
      <PageHeader
        icon={ClipboardCheck}
        tone={ATTENDANCE_TONE}
        title={t('attendance.title')}
        description={t('attendance.description')}
        actions={
          <>
            {seesAbsences(access) ? (
              <Button asChild variant="outline" size="sm" className="max-sm:size-11 max-sm:px-0">
                <Link to={`${base}/attendance/absences`} aria-label={t('attendance.absences')}>
                  <BellRing />
                  <span className="hidden sm:inline">{t('attendance.absences')}</span>
                </Link>
              </Button>
            ) : null}
            {canCreate ? (
              <Button
                size="sm"
                className="max-sm:size-11 max-sm:px-0"
                aria-label={t('attendance.newSession')}
                onClick={() => setState({ new: true }, { push: true })}
              >
                <Plus />
                <span className="hidden sm:inline">{t('attendance.newSession')}</span>
              </Button>
            ) : null}
          </>
        }
      />

      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('attendance.searchSessions'),
        }}
        filters={[
          {
            id: 'group',
            label: t('attendance.filterGroup'),
            value: state.groupId,
            onChange: (groupId) => setState({ groupId }),
            options: groupOptions,
          },
          {
            id: 'mode',
            label: t('attendance.filterMode'),
            value: state.mode,
            onChange: (mode) => setState({ mode }),
            options: ATTENDANCE_MODES.map((mode) => ({
              value: mode,
              label: localize(ATTENDANCE_MODE_LABELS[mode], locale),
            })),
          },
        ]}
        sort={{
          value: state.sort,
          onChange: (sort) => setState({ sort }),
          options: [
            { value: 'recent', label: t('attendance.sortRecent') },
            { value: 'oldest', label: t('attendance.sortOldest') },
            { value: 'title', label: t('attendance.sortTitle') },
          ],
        }}
        onReset={() => reset(['sort'])}
        actions={
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <Link to={`${base}/attendance/me`}>
              <UserRoundCheck />
              {t('attendance.myAttendance')}
            </Link>
          </Button>
        }
      />

      {query.isPending ? (
        <SkeletonList rows={6} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={ClipboardList}
            tone="slate"
            title={t('attendance.emptyFilteredTitle')}
            description={t('common.noResultsHint')}
            action={
              <Button variant="outline" onClick={() => reset(['sort'])}>
                {t('common.clearAll')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={ClipboardCheck}
            tone={ATTENDANCE_TONE}
            title={t('attendance.emptyTitle')}
            description={t('attendance.emptyBody')}
            action={
              canCreate ? (
                <Button onClick={() => setState({ new: true }, { push: true })}>
                  <Plus />
                  {t('attendance.newSession')}
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t('attendance.sessionsCount', { count: query.data.total })}
          </p>
          <ListGroup>
            {query.data.items.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ListGroup>
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => {
              setState({ page });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      )}

      {canCreate ? (
        <NewSessionDialog
          open={state.new}
          onOpenChange={(open) => (open ? setState({ new: true }) : setState({ new: false }))}
        />
      ) : null}
    </Page>
  );
}

function SessionRow({ session }: { session: AttendanceSessionView }) {
  const { base } = useChurch();
  const { t, formatDateTime, formatNumber } = useI18n();
  const headcount = session.mode === 'headcount';
  return (
    <ListRow
      to={`${base}/attendance/${session.id}`}
      leading={<DateChip value={session.sessionAt} />}
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{session.title}</span>
          {headcount ? (
            <StatusBadge tone="sky" size="sm" icon={Users} className="hidden sm:inline-flex">
              {t('attendance.headcountTitle')}
            </StatusBadge>
          ) : null}
        </span>
      }
      subtitle={`${formatDateTime(session.sessionAt)} · ${session.groupName ?? t('attendance.churchWide')}`}
      trailing={
        <span className="flex flex-col items-end gap-1.5 sm:w-32">
          <span className="font-semibold text-foreground tabular">
            {headcount
              ? t('attendance.counted', { count: formatNumber(session.attendeeCount) })
              : t('attendance.attendees', { count: formatNumber(session.presentCount) })}
          </span>
          {!headcount && session.totalCount > 0 ? (
            <MarkBar
              className="hidden sm:flex"
              present={session.presentCount}
              absent={session.absentCount}
              excused={session.excusedCount}
              total={session.totalCount}
            />
          ) : null}
        </span>
      }
    />
  );
}

type SessionForm = z.input<typeof attendanceSessionInputSchema>;

/** Creates a session and opens it. Leaders pick one of their groups; recorders any scope. */
export function NewSessionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* The content unmounts when closed, so every opening starts with a fresh form. */}
        <NewSessionForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NewSessionForm({ onDone }: { onDone: () => void }) {
  const { churchId, base, access } = useChurch();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const groups = useQuery(groupsQuery(churchId));
  const churchWide = can.recordAttendance(access, { groupId: null });
  const selectable = (groups.data?.items ?? []).filter((group) =>
    can.recordAttendance(access, { groupId: group.id }),
  );
  const form = useForm<SessionForm, unknown, z.output<typeof attendanceSessionInputSchema>>({
    resolver: zodResolver(attendanceSessionInputSchema),
    defaultValues: {
      title: '',
      groupId: churchWide ? null : (access.leaderGroupIds[0] ?? null),
      eventId: null,
      sessionAt: new Date().toISOString(),
      notes: '',
      mode: 'roster',
      headcount: null,
    },
  });
  const errors = form.formState.errors;
  const mode = useWatch({ control: form.control, name: 'mode' });
  const create = useMutationToast(useCreateAttendanceSession(churchId), {
    success: t('attendance.created'),
    form,
  });

  const submit = form.handleSubmit(async (values) => {
    if (!churchWide && !values.groupId) {
      form.setError('groupId', { message: t('attendance.chooseGroup') });
      return;
    }
    const result = await create.run({
      ...values,
      headcount:
        values.mode === 'headcount' ? { men: 0, women: 0, children: 0, visitors: 0 } : null,
    });
    if (result) {
      onDone();
      navigate(`${base}/attendance/${result.session.id}`);
    }
  });

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex min-h-0 flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{t('attendance.newTitle')}</DialogTitle>
        <DialogDescription>{t('attendance.newDescription')}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <Field
          label={t('attendance.fieldTitle')}
          htmlFor="session-title"
          error={errors.title?.message}
          required
        >
          <Input
            id="session-title"
            autoFocus
            placeholder={t('attendance.fieldTitlePlaceholder')}
            aria-invalid={!!errors.title}
            {...form.register('title')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('attendance.fieldScope')}
            htmlFor="session-group"
            error={errors.groupId?.message}
          >
            <Controller
              control={form.control}
              name="groupId"
              render={({ field }) => (
                <Select
                  id="session-group"
                  value={field.value ?? ''}
                  aria-invalid={!!errors.groupId}
                  onChange={(event) => field.onChange(event.target.value || null)}
                >
                  {churchWide ? (
                    <option value="">{t('attendance.churchWide')}</option>
                  ) : (
                    <option value="">{t('attendance.fieldScopeChoose')}</option>
                  )}
                  {selectable.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </Select>
              )}
            />
          </Field>
          <Field
            label={t('attendance.fieldWhen')}
            htmlFor="session-at"
            error={errors.sessionAt?.message}
            required
          >
            <Controller
              control={form.control}
              name="sessionAt"
              render={({ field }) => (
                <DateTimeInput
                  id="session-at"
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={!!errors.sessionAt}
                />
              )}
            />
          </Field>
        </div>
        <Field
          label={t('attendance.fieldMode')}
          description={
            mode === 'headcount'
              ? t('attendance.modeHeadcountHint')
              : t('attendance.modeRosterHint')
          }
        >
          <Controller
            control={form.control}
            name="mode"
            render={({ field }) => (
              <Segmented<AttendanceMode>
                aria-label={t('attendance.fieldMode')}
                value={field.value ?? 'roster'}
                onChange={field.onChange}
                options={ATTENDANCE_MODES.map((value) => ({
                  value,
                  label: localize(ATTENDANCE_MODE_LABELS[value], locale),
                  icon: value === 'headcount' ? Users : UserRoundCheck,
                }))}
              />
            )}
          />
        </Field>
        <Field
          label={t('attendance.fieldNotes')}
          htmlFor="session-notes"
          error={errors.notes?.message}
        >
          <Textarea
            id="session-notes"
            rows={2}
            placeholder={t('attendance.fieldNotesPlaceholder')}
            {...form.register('notes')}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t('attendance.create')}
        </Button>
      </DialogFooter>
    </form>
  );
}
