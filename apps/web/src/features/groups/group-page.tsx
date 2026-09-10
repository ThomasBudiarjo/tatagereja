import { GROUP_TYPE_LABELS, fullName } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Megaphone, Pencil, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { ListGroup, ListRow } from '@/components/ui/list';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { membersQuery } from '@/features/churches/api';
import { PersonPickerDialog } from '@/features/people/person-picker';
import { getErrorMessage } from '@/lib/api';
import {
  groupQuery,
  useAddGroupLeader,
  useAddGroupMembers,
  useDeleteGroup,
  useRemoveGroupLeader,
  useRemoveGroupMember,
  useUpdateGroup,
} from './api';
import { GroupForm } from './group-form';

export function GroupPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base } = useChurch();
  const navigate = useNavigate();
  const query = useQuery(groupQuery(churchId, id));
  const update = useUpdateGroup(churchId, id);
  const remove = useDeleteGroup(churchId);
  const addMembers = useAddGroupMembers(churchId, id);
  const removeMember = useRemoveGroupMember(churchId, id);
  const addLeader = useAddGroupLeader(churchId, id);
  const removeLeader = useRemoveGroupLeader(churchId, id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [leaderUserId, setLeaderUserId] = useState('');
  const [removingMember, setRemovingMember] = useState<{ id: string; name: string } | null>(null);
  const members = useQuery({ ...membersQuery(churchId), enabled: leaderOpen });

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader backTo={`${base}/groups`} title="Group" />
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Page>
    );
  }

  const { group, members: groupMembers, canManage, canDelete, canAssignLeaders } = query.data;
  const leaderIds = group.leaders.map((leader) => leader.userId);
  const availableLeaders = (members.data?.items ?? []).filter(
    (membership) => !leaderIds.includes(membership.userId),
  );

  return (
    <Page>
      <PageHeader
        backTo={`${base}/groups`}
        eyebrow={GROUP_TYPE_LABELS[group.type]}
        title={group.name}
        description={group.meetingSchedule ?? undefined}
        actions={
          canManage ? (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          ) : null
        }
      />

      {group.description || !group.isActive ? (
        <Card>
          <CardContent className="space-y-2 text-sm">
            {!group.isActive ? <Badge variant="muted">Inactive group</Badge> : null}
            {group.description ? <p className="whitespace-pre-wrap">{group.description}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link to={`${base}/events/new?groupId=${group.id}`}>
              <CalendarPlus className="size-5" />
              New event
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link to={`${base}/announcements/new?groupId=${group.id}`}>
              <Megaphone className="size-5" />
              Announce
            </Link>
          </Button>
        </div>
      ) : null}

      <Section
        title={`Leaders (${group.leaders.length})`}
        action={
          canAssignLeaders ? (
            <Button size="sm" variant="ghost" onClick={() => setLeaderOpen(true)}>
              <UserPlus /> Assign
            </Button>
          ) : null
        }
      >
        {group.leaders.length === 0 ? (
          <EmptyState
            title="No leaders assigned"
            description="Assigned leaders can manage this group, its events, announcements and attendance."
          />
        ) : (
          <ListGroup>
            {group.leaders.map((leader) => (
              <ListRow
                key={leader.userId}
                leading={<EntityAvatar name={leader.name} src={leader.avatarUrl} size="sm" />}
                title={leader.name}
                subtitle={leader.email}
                trailing={
                  canAssignLeaders ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${leader.name} as leader`}
                      onClick={async () => {
                        try {
                          await removeLeader.mutateAsync(leader.userId);
                          toast.success('Leader removed');
                        } catch (error) {
                          toast.error(getErrorMessage(error));
                        }
                      }}
                    >
                      <UserMinus />
                    </Button>
                  ) : null
                }
              />
            ))}
          </ListGroup>
        )}
      </Section>

      <Section
        title={`Members (${groupMembers.length})`}
        action={
          canManage ? (
            <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
              <UserPlus /> Add
            </Button>
          ) : null
        }
      >
        {groupMembers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members yet"
            description={canManage ? 'Add people from the directory.' : undefined}
          />
        ) : (
          <ListGroup>
            {groupMembers.map((member) => (
              <ListRow
                key={member.id}
                to={`${base}/people/${member.id}`}
                leading={<EntityAvatar name={fullName(member)} src={member.photoUrl} size="sm" />}
                title={fullName(member)}
                trailing={
                  canManage ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${fullName(member)} from group`}
                      onClick={(event) => {
                        event.preventDefault();
                        setRemovingMember({ id: member.id, name: fullName(member) });
                      }}
                    >
                      <UserMinus />
                    </Button>
                  ) : null
                }
                chevron={false}
              />
            ))}
          </ListGroup>
        )}
      </Section>

      {canDelete ? (
        <Button variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 /> Delete group
        </Button>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit group</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <GroupForm
              group={group}
              submitLabel="Save changes"
              onCancel={() => setEditOpen(false)}
              onSubmit={async (values) => {
                await update.mutateAsync(values);
                setEditOpen(false);
                toast.success('Group updated');
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      <PersonPickerDialog
        churchId={churchId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Add members"
        description={`Select people to add to ${group.name}.`}
        excludeIds={groupMembers.map((member) => member.id)}
        loading={addMembers.isPending}
        onConfirm={async (personIds) => {
          try {
            await addMembers.mutateAsync({ personIds });
            setPickerOpen(false);
            toast.success(
              `${personIds.length} ${personIds.length === 1 ? 'person' : 'people'} added`,
            );
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />

      <Dialog open={leaderOpen} onOpenChange={setLeaderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign a leader</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {members.isPending ? (
              <PageLoader />
            ) : members.isError ? (
              <ErrorState message={getErrorMessage(members.error)} />
            ) : (
              <Field
                label="Church account"
                htmlFor="leader-user"
                description="Leaders manage this group's members, events, announcements and attendance."
              >
                <Select
                  id="leader-user"
                  value={leaderUserId}
                  onChange={(event) => setLeaderUserId(event.target.value)}
                >
                  <option value="">Select a person…</option>
                  {availableLeaders.map((membership) => (
                    <option key={membership.userId} value={membership.userId}>
                      {membership.user.name} · {membership.user.email}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLeaderOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!leaderUserId}
              loading={addLeader.isPending}
              onClick={async () => {
                try {
                  await addLeader.mutateAsync({ userId: leaderUserId });
                  setLeaderOpen(false);
                  setLeaderUserId('');
                  toast.success('Leader assigned');
                } catch (error) {
                  toast.error(getErrorMessage(error));
                }
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removingMember}
        onOpenChange={(open) => !open && setRemovingMember(null)}
        title={`Remove ${removingMember?.name ?? ''} from ${group.name}?`}
        description="They stay in the church directory."
        confirmLabel="Remove"
        loading={removeMember.isPending}
        onConfirm={async () => {
          if (!removingMember) return;
          try {
            await removeMember.mutateAsync(removingMember.id);
            setRemovingMember(null);
            toast.success('Member removed');
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${group.name}?`}
        description="Group events, announcements and attendance sessions for this group are deleted too."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(group.id);
            toast.success('Group deleted');
            navigate(`${base}/groups`, { replace: true });
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </Page>
  );
}
