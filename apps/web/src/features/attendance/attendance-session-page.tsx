import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_TEXT,
  HEADCOUNT_CATEGORIES,
  HEADCOUNT_LABELS,
  HEADCOUNT_MAX,
  attendanceSessionUpdateSchema,
  fullName,
  headcountSchema,
  headcountTotal,
  localize,
  type AttendanceRecord,
  type AttendanceSessionDetail,
  type AttendanceStatus,
  type Headcount,
  type HeadcountCategory,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  Baby,
  Check,
  CheckCheck,
  CircleSlash,
  CloudCheck,
  ListChecks,
  LoaderCircle,
  Minus,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserPlus,
  UserRound,
  UserRoundPlus,
  Users,
  X,
} from 'lucide-react';
import * as React from 'react';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Input, Textarea } from '@/components/ui/input';
import { Alert, SearchInput } from '@/components/ui/misc';
import { Skeleton, SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { PersonPickerDialog } from '@/features/people/person-picker';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isGone, useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { useWindowVirtualizer } from '@/lib/use-window-virtualizer';
import { cn } from '@/lib/utils';
import {
  attendanceSessionQuery,
  useBulkMarkAttendance,
  useDeleteAttendanceSession,
  useSaveAttendanceRecords,
  useSaveHeadcount,
  useUpdateAttendanceSession,
  type MarkInput,
} from './api';
import { ATTENDANCE_TONE, STATUS_TONES } from './attendance-lib';

/** Marks are saved in one request once tapping pauses for this long. */
const SAVE_DELAY_MS = 600;

export function AttendanceSessionPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base } = useChurch();
  const { t, formatDateTime } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(attendanceSessionQuery(churchId, id));
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useMutationToast(useDeleteAttendanceSession(churchId), {
    success: t('attendance.deleted'),
  });

  const crumbs = [{ label: t('attendance.title'), to: `${base}/attendance` }];

  if (query.isPending) {
    return (
      <Page size="wide">
        <PageHeader
          title={<Skeleton className="h-8 w-56" />}
          breadcrumbs={crumbs}
          documentTitle={t('attendance.title')}
        />
        <SkeletonStats />
        <SkeletonList rows={6} />
      </Page>
    );
  }
  if (query.isError) {
    // A session of another group (403) or one deleted meanwhile (404) is not worth a retry.
    const status = isApiClientError(query.error) ? query.error.status : 0;
    return (
      <Page size="wide">
        <PageHeader title={t('attendance.title')} breadcrumbs={crumbs} />
        {status === 403 || status === 404 ? (
          <NoAccessState
            title={status === 404 ? t('attendance.sessionGoneTitle') : undefined}
            description={status === 404 ? t('attendance.sessionGoneBody') : undefined}
            action={
              <Button asChild>
                <Link to={`${base}/attendance`}>{t('attendance.backToSessions')}</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            error={query.error}
            message={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )}
      </Page>
    );
  }

  const { session, canManage } = query.data;
  const headcount = session.mode === 'headcount';

  return (
    <Page size="wide">
      <PageHeader
        eyebrow={session.groupName ?? session.eventTitle ?? t('attendance.churchWide')}
        tone={ATTENDANCE_TONE}
        title={session.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {formatDateTime(session.sessionAt)}
            {headcount ? (
              <StatusBadge tone="sky" size="sm" icon={Users}>
                {t('attendance.headcountTitle')}
              </StatusBadge>
            ) : null}
          </span>
        }
        breadcrumbs={[...crumbs, { label: session.title }]}
        actions={
          canManage ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil />
                <span className="hidden sm:inline">{t('attendance.edit')}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                aria-label={t('attendance.delete')}
                onClick={() => setDeleting(true)}
              >
                <Trash2 />
              </Button>
            </>
          ) : undefined
        }
      />

      {session.notes ? (
        <Card>
          <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">
            {session.notes}
          </CardContent>
        </Card>
      ) : null}
      {!canManage ? <Alert variant="info">{t('attendance.readOnly')}</Alert> : null}

      {headcount ? (
        <HeadcountPanel key={session.updatedAt} detail={query.data} />
      ) : (
        <RosterSheet detail={query.data} />
      )}

      {canManage ? (
        <>
          <EditSessionDialog open={editing} onOpenChange={setEditing} detail={query.data} />
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={t('attendance.deleteTitle', { title: session.title })}
            description={t('attendance.deleteBody')}
            confirmText={session.title}
            confirmLabel={t('attendance.delete')}
            variant="destructive"
            loading={remove.isPending}
            onConfirm={async () => {
              const done = await remove.run(session.id);
              if (done) navigate(`${base}/attendance`, { replace: true });
            }}
          />
        </>
      ) : null}
    </Page>
  );
}

// ---- Roll call ----------------------------------------------------------------------------------

type Show = 'all' | 'unmarked' | AttendanceStatus;

const KEY_STATUS: Record<string, AttendanceStatus | null> = {
  h: 'present',
  p: 'present',
  a: 'absent',
  t: 'absent',
  i: 'excused',
  e: 'excused',
  '0': null,
  backspace: null,
  delete: null,
};

/**
 * The roll-call sheet. Taps change the row at once and are saved together after a short pause;
 * a failed save is undone with a message. Rows are keyboard navigable: arrows move, letters mark
 * and move on.
 */
function RosterSheet({ detail }: { detail: AttendanceSessionDetail }) {
  const { churchId } = useChurch();
  const { t, formatNumber } = useI18n();
  const { session, canManage } = detail;
  const save = useSaveAttendanceRecords(churchId, session.id);
  const bulk = useBulkMarkAttendance(churchId, session.id);
  const [pending, setPending] = useState<Map<string, AttendanceStatus | null>>(new Map());
  const pendingRef = useRef(pending);
  useLayoutEffect(() => {
    pendingRef.current = pending;
  });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [picker, setPicker] = useState(false);
  const [state, setState] = useUrlState({ show: 'all' });
  const show = state.show as Show;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const { mutateAsync } = save;

  const records = detail.records;
  const statusOf = useCallback(
    (record: AttendanceRecord) =>
      pending.has(record.id) ? (pending.get(record.id) ?? null) : record.status,
    [pending],
  );

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = pendingRef.current;
    if (batch.size === 0) return;
    const notes = new Map(records.map((record) => [record.id, record.note]));
    const payload: MarkInput[] = [...batch].map(([personId, status]) => ({
      personId,
      status,
      note: notes.get(personId) ?? null,
    }));
    setSaving(true);
    try {
      await mutateAsync({ records: payload });
    } catch (error) {
      toast.error(isGone(error) ? getErrorMessage(error) : t('attendance.saveFailed'));
    } finally {
      // Whatever happened, the cache now holds the truth for these people.
      setPending((current) => {
        const next = new Map(current);
        for (const [personId, status] of batch) {
          if (next.get(personId) === status) next.delete(personId);
        }
        return next;
      });
      setSaving(false);
    }
  }, [mutateAsync, records, t]);

  const mark = (personId: string, status: AttendanceStatus | null) => {
    setPending((current) => new Map(current).set(personId, status));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  // Leaving the page saves what is still waiting.
  const flushRef = useRef(flush);
  useLayoutEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => void flushRef.current(), []);
  const guard = useUnsavedChangesGuard(pending.size > 0 && !saving);

  const counts = useMemo(() => {
    const result = { present: 0, absent: 0, excused: 0, unmarked: 0 };
    for (const record of records) {
      const status = statusOf(record);
      if (status) result[status] += 1;
      else result.unmarked += 1;
    }
    return result;
  }, [records, statusOf]);

  // Typing stays immediate while a roster of thousands filters behind it.
  const needle = useDeferredValue(search).trim().toLowerCase();
  const visible = useMemo(
    () =>
      records.filter((record) => {
        const status = statusOf(record);
        if (show === 'unmarked' ? status !== null : show !== 'all' && status !== show) {
          return false;
        }
        return !needle || fullName(record).toLowerCase().includes(needle);
      }),
    [records, statusOf, show, needle],
  );
  // A whole congregation's roster: only the rows near the screen are mounted.
  const { attachList, rows, paddingTop, paddingBottom, measure, scrollToIndex, isMounted } =
    useWindowVirtualizer({
      count: visible.length,
      estimateSize: 65,
      getKey: useCallback((index: number) => visible[index]!.id, [visible]),
    });

  const runBulk = async (status: AttendanceStatus) => {
    await flush();
    try {
      const result = await bulk.mutateAsync({ status, onlyUnmarked: true });
      toast.success(t('attendance.markedAll', { count: result.changed }));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const focusRow = (index: number) => {
    const clamped = Math.max(0, Math.min(visible.length - 1, index));
    const target = visible[clamped];
    if (!target) return;
    if (!isMounted(clamped)) scrollToIndex(clamped);
    const focus = (attempts: number) => {
      const element = rowRefs.current.get(target.id);
      if (element) element.focus();
      else if (attempts > 0) requestAnimationFrame(() => focus(attempts - 1));
    };
    focus(3);
  };

  const onRowKeyDown = (event: React.KeyboardEvent<HTMLLIElement>, index: number) => {
    if (event.target !== event.currentTarget) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowdown' || key === 'j') {
      event.preventDefault();
      focusRow(index + 1);
    } else if (key === 'arrowup' || key === 'k') {
      event.preventDefault();
      focusRow(index - 1);
    } else if (key === '/') {
      event.preventDefault();
      searchRef.current?.focus();
    } else if (canManage && key in KEY_STATUS) {
      event.preventDefault();
      const record = visible[index];
      if (!record) return;
      mark(record.id, KEY_STATUS[key] ?? null);
      focusRow(index + 1);
    }
  };

  const filters: {
    value: Show;
    label: string;
    count: number;
    tone: 'neutral' | 'success' | 'danger' | 'warning';
  }[] = [
    { value: 'all', label: t('attendance.filterAll'), count: records.length, tone: 'neutral' },
    { value: 'unmarked', label: t('attendance.unmarked'), count: counts.unmarked, tone: 'neutral' },
    { value: 'present', label: t('attendance.present'), count: counts.present, tone: 'success' },
    { value: 'absent', label: t('attendance.absent'), count: counts.absent, tone: 'danger' },
    { value: 'excused', label: t('attendance.excused'), count: counts.excused, tone: 'warning' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('attendance.present')}
          value={formatNumber(counts.present)}
          icon={Check}
          tone="success"
        />
        <StatCard
          label={t('attendance.absent')}
          value={formatNumber(counts.absent)}
          icon={CircleSlash}
          tone="danger"
        />
        <StatCard
          label={t('attendance.excused')}
          value={formatNumber(counts.excused)}
          icon={Minus}
          tone="warning"
        />
        <StatCard
          label={t('attendance.unmarked')}
          value={formatNumber(counts.unmarked)}
          icon={ListChecks}
          tone="neutral"
        />
      </div>

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={bulk.isPending && bulk.variables?.status === 'present'}
            disabled={bulk.isPending || counts.unmarked === 0}
            onClick={() => void runBulk('present')}
          >
            <CheckCheck />
            {t('attendance.markAllPresent')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            loading={bulk.isPending && bulk.variables?.status === 'absent'}
            disabled={bulk.isPending || counts.unmarked === 0}
            onClick={() => void runBulk('absent')}
          >
            <CircleSlash />
            {t('attendance.markRestAbsent')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPicker(true)}>
            <UserPlus />
            {t('attendance.addPeople')}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <SearchInput
          inputRef={searchRef}
          value={search}
          onChange={setSearch}
          placeholder={t('attendance.searchRoster')}
        />
        <div
          role="radiogroup"
          aria-label={t('common.filters')}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 scrollbar-none sm:mx-0 sm:px-0"
        >
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="radio"
              aria-checked={show === filter.value}
              onClick={() => setState({ show: filter.value })}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                show === filter.value
                  ? 'border-primary/30 bg-accent text-accent-foreground'
                  : 'border-input bg-card hover:bg-muted',
              )}
            >
              {filter.tone !== 'neutral' ? (
                <span data-tone={filter.tone} className="size-2 rounded-full bg-tone" aria-hidden />
              ) : null}
              {filter.label}
              <span className="text-xs text-muted-foreground tabular">
                {formatNumber(filter.count)}
              </span>
            </button>
          ))}
        </div>
        {canManage ? (
          <p className="hidden text-xs text-muted-foreground [@media(hover:hover)]:block">
            {t('attendance.keyboardHint')}
          </p>
        ) : null}
      </div>

      {records.length === 0 ? (
        <EmptyState
          icon={UserRoundPlus}
          tone={ATTENDANCE_TONE}
          title={t('attendance.rosterEmpty')}
          description={canManage ? t('attendance.rosterEmptyBody') : undefined}
          action={
            canManage ? (
              <Button onClick={() => setPicker(true)}>
                <UserPlus />
                {t('attendance.addPeople')}
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState compact icon={UserRound} tone="slate" title={t('attendance.rosterNoMatch')} />
      ) : (
        <ul
          ref={attachList}
          style={{ paddingTop, paddingBottom }}
          className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft"
        >
          {rows.map((index) => {
            const record = visible[index]!;
            const status = statusOf(record);
            const name = fullName(record);
            const measureRow = measure(index);
            return (
              <li
                key={record.id}
                ref={(element) => {
                  if (!element) return;
                  rowRefs.current.set(record.id, element);
                  const stop = measureRow(element);
                  return () => {
                    rowRefs.current.delete(record.id);
                    stop?.();
                  };
                }}
                aria-setsize={visible.length}
                aria-posinset={index + 1}
                tabIndex={index === rows[0] ? 0 : -1}
                onKeyDown={(event) => onRowKeyDown(event, index)}
                onFocus={(event) => {
                  if (event.target !== event.currentTarget) return;
                  for (const element of rowRefs.current.values()) element.tabIndex = -1;
                  event.currentTarget.tabIndex = 0;
                }}
                aria-label={name}
                className={cn(
                  'flex min-h-16 items-center gap-3 px-3 py-2 outline-none transition-colors focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset sm:px-4',
                  pending.has(record.id) && 'bg-muted/30',
                )}
              >
                <EntityAvatar name={name} src={record.photoUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  {record.note ? (
                    <p className="truncate text-xs text-muted-foreground">{record.note}</p>
                  ) : null}
                </div>
                <StatusButtons
                  name={name}
                  value={status}
                  disabled={!canManage}
                  onChange={(next) => mark(record.id, next)}
                />
              </li>
            );
          })}
        </ul>
      )}

      {canManage && records.length > 0 ? (
        <div
          className="sticky bottom-20 z-20 mx-auto flex w-fit items-center gap-2 rounded-full border border-border/70 bg-popover/95 px-4 py-2 text-sm shadow-raised backdrop-blur md:bottom-4"
          role="status"
          aria-live="polite"
        >
          {pending.size > 0 || saving ? (
            <>
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden />
              {t('attendance.saving')}
            </>
          ) : (
            <>
              <CloudCheck className="size-4 text-success" aria-hidden />
              {t('attendance.allSaved')}
            </>
          )}
          <span className="text-muted-foreground tabular">
            · {formatNumber(counts.present)}/{formatNumber(records.length)}
          </span>
        </div>
      ) : null}

      <PersonPickerDialog
        churchId={churchId}
        open={picker}
        onOpenChange={setPicker}
        title={t('attendance.addPeopleTitle')}
        excludeIds={records.map((record) => record.id)}
        confirmLabel={t('attendance.addAsPresent')}
        loading={save.isPending}
        onConfirm={async (personIds) => {
          await flush();
          try {
            await mutateAsync({
              records: personIds.map((personId) => ({ personId, status: 'present', note: null })),
            });
            toast.success(t('attendance.markedAll', { count: personIds.length }));
            setPicker(false);
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
      {guard}
    </>
  );
}

const STATUS_BUTTON_ICONS: Record<AttendanceStatus, React.ComponentType<{ className?: string }>> = {
  present: Check,
  absent: X,
  excused: Minus,
};

function StatusButtons({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: AttendanceStatus | null;
  disabled: boolean;
  onChange: (value: AttendanceStatus | null) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('attendance.markFor', { name })}
      className="flex shrink-0 gap-1.5"
    >
      {ATTENDANCE_STATUSES.map((status) => {
        const Icon = STATUS_BUTTON_ICONS[status];
        const selected = value === status;
        const label = localize(ATTENDANCE_STATUS_TEXT[status], locale);
        return (
          <button
            key={status}
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-pressed={selected}
            aria-label={label}
            title={label}
            data-tone={STATUS_TONES[status]}
            onClick={() => onChange(selected ? null : status)}
            className={cn(
              'flex size-11 items-center justify-center rounded-xl border transition-[background-color,border-color,color,transform] duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-60',
              selected
                ? 'border-transparent bg-tone text-tone-foreground shadow-xs'
                : 'border-input bg-card text-muted-foreground hover:bg-tone-soft hover:text-tone-ink',
            )}
          >
            <Icon className="size-5" />
          </button>
        );
      })}
    </div>
  );
}

// ---- Headcount ----------------------------------------------------------------------------------

const HEADCOUNT_ICONS: Record<HeadcountCategory, React.ComponentType<{ className?: string }>> = {
  men: UserRound,
  women: UserRound,
  children: Baby,
  visitors: UserRoundPlus,
};

const HEADCOUNT_TONES = { men: 'sky', women: 'rose', children: 'sun', visitors: 'violet' } as const;

function HeadcountPanel({ detail }: { detail: AttendanceSessionDetail }) {
  const { churchId } = useChurch();
  const { t, locale, formatNumber } = useI18n();
  const { session, canManage } = detail;
  const initial: Headcount = session.headcount ?? { men: 0, women: 0, children: 0, visitors: 0 };
  const form = useForm<z.input<typeof headcountSchema>, unknown, Headcount>({
    resolver: zodResolver(headcountSchema),
    defaultValues: initial,
  });
  const values = useWatch({ control: form.control });
  const total = headcountTotal({
    men: Number(values.men) || 0,
    women: Number(values.women) || 0,
    children: Number(values.children) || 0,
    visitors: Number(values.visitors) || 0,
  });
  const save = useMutationToast(useSaveHeadcount(churchId, session.id), {
    success: t('attendance.headcountSaved'),
    form,
  });
  const { isDirty, isSubmitting } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting);
  const submit = form.handleSubmit(async (counts) => {
    if (await save.run(counts)) form.reset(counts);
  });
  const step = (category: HeadcountCategory, delta: number) => {
    const current = Number(form.getValues(category)) || 0;
    const next = Math.max(0, Math.min(HEADCOUNT_MAX, current + delta));
    form.setValue(category, next, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">
          {t('attendance.headcountTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('attendance.headcountDescription')}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {HEADCOUNT_CATEGORIES.map((category) => {
          const label = localize(HEADCOUNT_LABELS[category], locale);
          const Icon = HEADCOUNT_ICONS[category];
          const error = form.formState.errors[category]?.message;
          return (
            <div
              key={category}
              data-tone={HEADCOUNT_TONES[category]}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-card p-3 shadow-soft sm:flex-col sm:items-stretch sm:p-4"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tone-soft text-tone-ink">
                  <Icon className="size-4" />
                </span>
                <label
                  htmlFor={`headcount-${category}`}
                  className="min-w-0 text-sm leading-tight font-semibold"
                >
                  {label}
                </label>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  disabled={!canManage}
                  aria-label={t('attendance.decrease', { label })}
                  onClick={() => step(category, -1)}
                >
                  <Minus />
                </Button>
                <Controller
                  control={form.control}
                  name={category}
                  render={({ field }) => (
                    <Input
                      id={`headcount-${category}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={HEADCOUNT_MAX}
                      readOnly={!canManage}
                      aria-invalid={!!error}
                      className="h-11 w-24 min-w-0 [appearance:textfield] px-1 text-center text-xl font-bold tabular sm:h-12 sm:w-auto sm:flex-1 sm:text-2xl [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      value={field.value ?? 0}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) =>
                        field.onChange(event.target.value === '' ? 0 : Number(event.target.value))
                      }
                    />
                  )}
                />
                <Button
                  type="button"
                  variant="tone"
                  size="icon-lg"
                  disabled={!canManage}
                  aria-label={t('attendance.increase', { label })}
                  onClick={() => step(category, 1)}
                >
                  <Plus />
                </Button>
              </div>
              {error ? (
                <p role="alert" className="w-full text-xs font-medium text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-20 z-20 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/95 p-3 shadow-raised backdrop-blur sm:p-4 md:static md:bg-card md:shadow-soft">
        <div>
          <p className="text-overline text-muted-foreground">{t('attendance.headcountTotal')}</p>
          <p className="text-2xl font-bold tracking-tight tabular sm:text-3xl" aria-live="polite">
            {formatNumber(total)}
          </p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-3">
            {isDirty ? (
              <StatusBadge tone="warning" dot className="hidden sm:inline-flex">
                {t('attendance.unsavedCounts')}
              </StatusBadge>
            ) : null}
            <Button
              type="submit"
              loading={save.isPending}
              disabled={!isDirty}
              className="flex-1 sm:flex-none"
            >
              <Save />
              {t('attendance.headcountSave')}
            </Button>
          </div>
        ) : null}
      </div>
      {guard}
    </form>
  );
}

// ---- Edit ---------------------------------------------------------------------------------------

type EditForm = z.input<typeof attendanceSessionUpdateSchema>;

function EditSessionDialog({
  open,
  onOpenChange,
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: AttendanceSessionDetail;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <EditSessionForm detail={detail} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditSessionForm({
  detail,
  onDone,
}: {
  detail: AttendanceSessionDetail;
  onDone: () => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const { session } = detail;
  const form = useForm<EditForm, unknown, z.output<typeof attendanceSessionUpdateSchema>>({
    resolver: zodResolver(attendanceSessionUpdateSchema),
    defaultValues: {
      title: session.title,
      sessionAt: session.sessionAt,
      notes: session.notes ?? '',
    },
  });
  const errors = form.formState.errors;
  const update = useMutationToast(useUpdateAttendanceSession(churchId, session.id), {
    success: t('attendance.saved'),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    if (await update.run(values)) onDone();
  });
  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex min-h-0 flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{t('attendance.editTitle')}</DialogTitle>
        <DialogDescription className="sr-only">{session.title}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <Field
          label={t('attendance.fieldTitle')}
          htmlFor="edit-title"
          error={errors.title?.message}
          required
        >
          <Input
            id="edit-title"
            autoFocus
            aria-invalid={!!errors.title}
            {...form.register('title')}
          />
        </Field>
        <Field
          label={t('attendance.fieldWhen')}
          htmlFor="edit-at"
          error={errors.sessionAt?.message}
          required
        >
          <Controller
            control={form.control}
            name="sessionAt"
            render={({ field }) => (
              <DateTimeInput id="edit-at" value={field.value} onChange={field.onChange} />
            )}
          />
        </Field>
        <Field
          label={t('attendance.fieldNotes')}
          htmlFor="edit-notes"
          error={errors.notes?.message}
        >
          <Textarea id="edit-notes" rows={3} {...form.register('notes')} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={update.isPending}>
          {t('common.saveChanges')}
        </Button>
      </DialogFooter>
    </form>
  );
}
