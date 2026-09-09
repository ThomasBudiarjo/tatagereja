import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  fullName,
  type AttendanceStatus,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckCheck, Save, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader, SearchInput, Stat } from '@/components/ui/misc';
import { PersonPickerDialog } from '@/features/people/person-picker';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  attendanceSessionQuery,
  useDeleteAttendanceSession,
  useSaveAttendanceRecords,
} from './api';

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-success text-success-foreground border-success',
  absent: 'bg-destructive text-destructive-foreground border-destructive',
  excused: 'bg-warning text-warning-foreground border-warning',
};

/** Unsaved edits are kept as an overlay on the server roster; 'none' means "clear the mark". */
type DraftValue = AttendanceStatus | 'none';

export function AttendanceSessionPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base } = useChurch();
  const navigate = useNavigate();
  const query = useQuery(attendanceSessionQuery(churchId, id));
  const save = useSaveAttendanceRecords(churchId, id);
  const remove = useDeleteAttendanceSession(churchId);
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [search, setSearch] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const roster = useMemo(() => query.data?.records ?? [], [query.data]);

  const marks = useMemo(
    () =>
      roster.map((record) => {
        const edit = draft[record.id];
        const status = edit === undefined ? record.status : edit === 'none' ? null : edit;
        return { record, status, changed: status !== record.status };
      }),
    [roster, draft],
  );

  const dirty = marks.some((mark) => mark.changed);
  const counts = {
    present: marks.filter((mark) => mark.status === 'present').length,
    absent: marks.filter((mark) => mark.status === 'absent').length,
    excused: marks.filter((mark) => mark.status === 'excused').length,
    unmarked: marks.filter((mark) => mark.status === null).length,
  };

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader backTo={`${base}/attendance`} title="Attendance session" />
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Page>
    );
  }

  const { session, canManage } = query.data;
  const visible = search
    ? marks.filter((mark) => fullName(mark.record).toLowerCase().includes(search.toLowerCase()))
    : marks;

  const persist = async (
    payload: { personId: string; status: AttendanceStatus | null; note: string | null }[],
  ) => {
    if (payload.length === 0) return;
    try {
      await save.mutateAsync({ records: payload });
      setDraft({});
      toast.success('Attendance saved');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const saveChanges = () =>
    persist(
      marks
        .filter((mark) => mark.changed)
        .map((mark) => ({ personId: mark.record.id, status: mark.status, note: mark.record.note })),
    );

  const markAllPresent = () =>
    setDraft((current) => {
      const next = { ...current };
      for (const mark of marks) if (mark.status === null) next[mark.record.id] = 'present';
      return next;
    });

  const toggle = (personId: string, value: AttendanceStatus, current: AttendanceStatus | null) =>
    setDraft((draftState) => ({ ...draftState, [personId]: current === value ? 'none' : value }));

  return (
    <Page>
      <PageHeader
        backTo={`${base}/attendance`}
        eyebrow={
          session.groupName ??
          (session.eventTitle !== session.title ? session.eventTitle : null) ??
          'Church-wide'
        }
        title={session.title}
        description={formatDateTime(session.sessionAt)}
      />

      <div className="grid grid-cols-4 gap-2">
        <Stat label="Present" value={counts.present} />
        <Stat label="Absent" value={counts.absent} />
        <Stat label="Excused" value={counts.excused} />
        <Stat label="Todo" value={counts.unmarked} />
      </div>

      {session.notes ? (
        <Card>
          <CardContent className="text-sm whitespace-pre-wrap">{session.notes}</CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={markAllPresent}>
            <CheckCheck /> Mark all present
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            <UserPlus /> Add people
          </Button>
        </div>
      ) : null}

      <SearchInput value={search} onChange={setSearch} placeholder="Search the roster" />

      {roster.length === 0 ? (
        <EmptyState
          title="Nobody on the roster"
          description={canManage ? 'Add people to record their attendance.' : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map(({ record, status }) => (
            <li
              key={record.id}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-soft"
            >
              <EntityAvatar name={fullName(record)} src={record.photoUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{fullName(record)}</p>
                {record.note ? (
                  <p className="truncate text-xs text-muted-foreground">{record.note}</p>
                ) : null}
              </div>
              <div
                className="flex shrink-0 gap-1"
                role="group"
                aria-label={`Attendance for ${fullName(record)}`}
              >
                {ATTENDANCE_STATUSES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!canManage}
                    aria-pressed={status === value}
                    title={ATTENDANCE_STATUS_LABELS[value]}
                    onClick={() => toggle(record.id, value, status)}
                    className={cn(
                      'size-9 rounded-lg border text-xs font-bold transition-colors disabled:opacity-60',
                      status === value
                        ? STATUS_STYLES[value]
                        : 'border-input bg-card text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {ATTENDANCE_STATUS_LABELS[value].charAt(0)}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <>
          <div className="sticky bottom-20 z-20 md:bottom-4">
            <Button
              className="w-full shadow-lg"
              size="lg"
              disabled={!dirty}
              loading={save.isPending}
              onClick={() => void saveChanges()}
            >
              <Save /> {dirty ? 'Save attendance' : 'All changes saved'}
            </Button>
          </div>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 /> Delete session
          </Button>
        </>
      ) : null}

      <PersonPickerDialog
        churchId={churchId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Add people to this session"
        excludeIds={roster.map((record) => record.id)}
        confirmLabel="Add as present"
        loading={save.isPending}
        onConfirm={async (personIds) => {
          await persist(personIds.map((personId) => ({ personId, status: 'present', note: null })));
          setPickerOpen(false);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${session.title}?`}
        description="All attendance records in this session are deleted."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(session.id);
            toast.success('Session deleted');
            navigate(`${base}/attendance`, { replace: true });
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </Page>
  );
}
