import { PARTICIPANT_STATUS_LABELS, fullName, type ParticipantStatus } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  ClipboardCheck,
  MapPin,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ListGroup, ListRow } from '@/components/ui/list';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { useCreateAttendanceSession } from '@/features/attendance/api';
import { PersonPickerDialog } from '@/features/people/person-picker';
import { getErrorMessage } from '@/lib/api';
import { formatEventRange } from '@/lib/format';
import {
  eventQuery,
  useAddParticipants,
  useDeleteEvent,
  useRemoveParticipant,
  useUpdateEvent,
  useUpdateParticipant,
} from './api';
import { EventForm } from './event-form';

const statusVariant = (status: ParticipantStatus) =>
  status === 'going' ? 'success' : status === 'not_going' ? 'destructive' : 'muted';

export function EventPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const query = useQuery(eventQuery(churchId, id));
  const update = useUpdateEvent(churchId, id);
  const remove = useDeleteEvent(churchId);
  const addParticipants = useAddParticipants(churchId, id);
  const updateParticipant = useUpdateParticipant(churchId, id);
  const removeParticipant = useRemoveParticipant(churchId, id);
  const createSession = useCreateAttendanceSession(churchId);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader backTo={`${base}/events`} title="Event" />
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Page>
    );
  }

  const { event, participants, sessions, canManage, canRecordAttendance } = query.data;
  const myParticipation = access.personId
    ? participants.find((participant) => participant.id === access.personId)
    : undefined;

  const startAttendance = async () => {
    try {
      const result = await createSession.mutateAsync({
        title: event.title,
        eventId: event.id,
        groupId: null,
        sessionAt: event.startsAt,
        notes: null,
      });
      navigate(`${base}/attendance/${result.session.id}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Page>
      <PageHeader
        backTo={`${base}/events`}
        eyebrow={event.groupName ?? 'Church-wide'}
        title={event.title}
        actions={
          canManage ? (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="space-y-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
            {formatEventRange(event.startsAt, event.endsAt, event.isAllDay)}
          </p>
          {event.location ? (
            <p className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              {event.location}
            </p>
          ) : null}
          {event.description ? (
            <p className="whitespace-pre-wrap text-muted-foreground">{event.description}</p>
          ) : null}
        </CardContent>
      </Card>

      {myParticipation || access.personId ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium">Are you going?</p>
              <p className="text-muted-foreground">Your response is visible to the organisers.</p>
            </div>
            <Select
              aria-label="Your response"
              className="w-36"
              value={myParticipation?.status ?? ''}
              onChange={async (selectEvent) => {
                const status = selectEvent.target.value as ParticipantStatus;
                if (!status || !access.personId) return;
                try {
                  await updateParticipant.mutateAsync({ personId: access.personId, status });
                  toast.success('Response saved');
                } catch (error) {
                  toast.error(getErrorMessage(error));
                }
              }}
            >
              <option value="" disabled>
                Respond…
              </option>
              <option value="going">Going</option>
              <option value="not_going">Not going</option>
              <option value="invited">Undecided</option>
            </Select>
          </CardContent>
        </Card>
      ) : null}

      <Section
        title={`Participants (${participants.length})`}
        action={
          canManage ? (
            <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
              <UserPlus /> Add
            </Button>
          ) : null
        }
      >
        {participants.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No participants yet"
            description={canManage ? 'Invite people from the directory.' : undefined}
          />
        ) : (
          <ListGroup>
            {participants.map((participant) => (
              <ListRow
                key={participant.id}
                to={`${base}/people/${participant.id}`}
                leading={
                  <EntityAvatar name={fullName(participant)} src={participant.photoUrl} size="sm" />
                }
                title={fullName(participant)}
                trailing={
                  <span className="flex items-center gap-1">
                    <Badge variant={statusVariant(participant.status)}>
                      {PARTICIPANT_STATUS_LABELS[participant.status]}
                    </Badge>
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${fullName(participant)}`}
                        onClick={async (clickEvent) => {
                          clickEvent.preventDefault();
                          try {
                            await removeParticipant.mutateAsync(participant.id);
                            toast.success('Participant removed');
                          } catch (error) {
                            toast.error(getErrorMessage(error));
                          }
                        }}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </span>
                }
                chevron={false}
              />
            ))}
          </ListGroup>
        )}
      </Section>

      {canRecordAttendance ? (
        <Section
          title="Attendance"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void startAttendance()}
              loading={createSession.isPending}
            >
              <ClipboardCheck /> New session
            </Button>
          }
        >
          {sessions.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No attendance sessions"
              description="Create a session to mark who attended this event."
            />
          ) : (
            <ListGroup>
              {sessions.map((session) => (
                <ListRow
                  key={session.id}
                  to={`${base}/attendance/${session.id}`}
                  title={session.title}
                  subtitle={formatEventRange(session.sessionAt, null, false)}
                  trailing={`${session.presentCount}/${session.totalCount} present`}
                />
              ))}
            </ListGroup>
          )}
        </Section>
      ) : null}

      {canManage ? (
        <Button variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 /> Delete event
        </Button>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit event</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <EventForm
              event={event}
              submitLabel="Save changes"
              onCancel={() => setEditOpen(false)}
              onSubmit={async (values) => {
                await update.mutateAsync(values);
                setEditOpen(false);
                toast.success('Event updated');
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      <PersonPickerDialog
        churchId={churchId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Add participants"
        excludeIds={participants.map((participant) => participant.id)}
        confirmLabel="Invite"
        loading={addParticipants.isPending}
        onConfirm={async (personIds) => {
          try {
            await addParticipants.mutateAsync({ personIds, status: 'invited' });
            setPickerOpen(false);
            toast.success('Participants added');
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${event.title}?`}
        description="Participants and linked attendance sessions are removed as well."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(event.id);
            toast.success('Event deleted');
            navigate(`${base}/events`, { replace: true });
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </Page>
  );
}
