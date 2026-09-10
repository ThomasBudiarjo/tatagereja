import { can, isAdmin } from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardCheck, ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
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
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/ui/list';
import { Alert, EmptyState, ErrorState, SearchInput, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { groupsQuery } from '@/features/groups/api';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { attendanceSessionsQuery, myAttendanceQuery, useCreateAttendanceSession } from './api';

function NewSessionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const groups = useQuery({ ...groupsQuery(churchId, { includeInactive: true }), enabled: open });
  const create = useCreateAttendanceSession(churchId);
  const admin = isAdmin(access);
  const [title, setTitle] = useState('');
  const [groupId, setGroupId] = useState('');
  const [sessionAt, setSessionAt] = useState(() => new Date().toISOString());
  const [error, setError] = useState<string | null>(null);

  const selectable = (groups.data?.items ?? []).filter(
    (group) => admin || access.leaderGroupIds.includes(group.id),
  );

  const submit = async () => {
    if (title.trim().length < 2) {
      setError('Enter a title with at least 2 characters');
      return;
    }
    if (!admin && !groupId) {
      setError('Select one of your groups');
      return;
    }
    try {
      const result = await create.mutateAsync({
        title: title.trim(),
        eventId: null,
        groupId: groupId || null,
        sessionAt,
        notes: null,
      });
      onOpenChange(false);
      navigate(`${base}/attendance/${result.session.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New attendance session</DialogTitle>
          <DialogDescription>
            Sessions for a group start with that group's members. Church-wide sessions list everyone
            who is not inactive.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {error ? <Alert variant="error">{error}</Alert> : null}
          <Field label="Title" htmlFor="session-title" required>
            <Input
              id="session-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setError(null);
              }}
              placeholder="Sunday service"
            />
          </Field>
          <Field label="Scope" htmlFor="session-group">
            <Select
              id="session-group"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              {admin ? (
                <option value="">Church-wide</option>
              ) : (
                <option value="">Select a group…</option>
              )}
              {selectable.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date and time" htmlFor="session-at" required>
            <DateTimeInput id="session-at" value={sessionAt} onChange={setSessionAt} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={create.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MyAttendance() {
  const { churchId } = useChurch();
  const query = useQuery(myAttendanceQuery(churchId));
  if (query.isPending) return <Skeleton className="h-24" />;
  if (query.isError)
    return (
      <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
    );
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No attendance recorded"
        description="Your attendance appears here once a leader records it."
      />
    );
  }
  return (
    <ListGroup>
      {query.data.items.map((item) => (
        <ListRow
          key={item.sessionId}
          title={item.title}
          subtitle={`${formatDateTime(item.sessionAt)}${item.groupName ? ` · ${item.groupName}` : ''}`}
          trailing={
            <Badge
              variant={
                item.status === 'present'
                  ? 'success'
                  : item.status === 'excused'
                    ? 'warning'
                    : 'destructive'
              }
              className="capitalize"
            >
              {item.status}
            </Badge>
          }
        />
      ))}
    </ListGroup>
  );
}

export function AttendancePage() {
  const { churchId, base, access } = useChurch();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [createOpen, setCreateOpen] = useState(false);
  const debounced = useDebounced(search);
  const canRecord = can.viewAttendanceOverview(access);
  const page = Number(params.get('page') ?? '1');

  const query = useQuery({
    ...attendanceSessionsQuery(churchId, {
      q: debounced || undefined,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      limit: 50,
    }),
    enabled: canRecord,
    placeholderData: keepPreviousData,
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  if (!canRecord) {
    return (
      <Page>
        <PageHeader
          backTo={`${base}/more`}
          title="My attendance"
          description="Your own attendance history."
        />
        <MyAttendance />
      </Page>
    );
  }

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.limit)) : 1;

  return (
    <Page>
      <PageHeader
        backTo={`${base}/more`}
        title="Attendance"
        description="Sessions you can record and review."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> New
          </Button>
        }
      />
      <SearchInput
        value={search}
        onChange={(value) => {
          setSearch(value);
          setParam('q', value);
        }}
        placeholder="Search sessions"
      />

      {query.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No attendance sessions yet"
          description="Create a session from an event or start a standalone one."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New session
            </Button>
          }
        />
      ) : (
        <>
          <ListGroup>
            {query.data.items.map((session) => (
              <ListRow
                key={session.id}
                to={`${base}/attendance/${session.id}`}
                title={session.title}
                subtitle={`${formatDateTime(session.sessionAt)}${session.groupName ? ` · ${session.groupName}` : ' · Church-wide'}`}
                trailing={
                  <span className="tabular">
                    {session.presentCount}/{session.totalCount || 0}
                  </span>
                }
              />
            ))}
          </ListGroup>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={query.data.page <= 1}
                onClick={() => setParam('page', String(query.data.page - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground tabular">
                Page {query.data.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={query.data.page >= totalPages}
                onClick={() => setParam('page', String(query.data.page + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      <NewSessionDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Page>
  );
}
