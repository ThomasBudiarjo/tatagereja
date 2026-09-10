import { ROLE_LABELS, can, type Membership } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Copy,
  MoreHorizontal,
  Plus,
  QrCode,
  Share2,
  ShieldCheck,
  Trash2,
  UserMinus,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FormActions } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/ui/list';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  invitationsQuery,
  useCreateInvitation,
  useRevokeInvitation,
} from '@/features/invitations/api';
import { getErrorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { useAuth } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import {
  membersQuery,
  useDeleteChurch,
  useLeaveChurch,
  useRemoveMember,
  useTransferOwnership,
  useUpdateChurch,
  useUpdateMemberRole,
} from './api';
import { ChurchForm } from './church-form';

function ProfilePanel() {
  const { church, churchId, isAdmin } = useChurch();
  const update = useUpdateChurch(churchId);
  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="font-semibold">{church.name}</p>
          {church.description ? (
            <p className="text-muted-foreground">{church.description}</p>
          ) : null}
          {church.address || church.city ? (
            <p>{[church.address, church.city].filter(Boolean).join(', ')}</p>
          ) : null}
          {church.phone ? <p>{church.phone}</p> : null}
          {church.email ? <p>{church.email}</p> : null}
          {church.website ? (
            <a
              href={church.website}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {church.website}
            </a>
          ) : null}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent>
        <ChurchForm
          church={church}
          submitLabel="Save changes"
          onSubmit={async (values) => {
            await update.mutateAsync(values);
            toast.success('Church updated');
          }}
        />
      </CardContent>
    </Card>
  );
}

function MembersPanel() {
  const { churchId, access } = useChurch();
  const { user } = useAuth();
  const members = useQuery(membersQuery(churchId));
  const updateRole = useUpdateMemberRole(churchId);
  const removeMember = useRemoveMember(churchId);
  const transfer = useTransferOwnership(churchId);
  const [removing, setRemoving] = useState<Membership | null>(null);
  const [transferring, setTransferring] = useState<Membership | null>(null);
  const [password, setPassword] = useState('');

  const changeRole = async (membership: Membership, role: 'administrator' | 'member') => {
    try {
      await updateRole.mutateAsync({ membershipId: membership.id, role });
      toast.success(`${membership.user.name} is now ${ROLE_LABELS[role].toLowerCase()}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  if (members.isPending) return <PageLoader />;
  if (members.isError)
    return (
      <ErrorState message={getErrorMessage(members.error)} onRetry={() => void members.refetch()} />
    );

  return (
    <>
      <ListGroup>
        {members.data.items.map((membership) => {
          const isSelf = membership.userId === user?.id;
          const canChange = can.changeMemberRole(access, membership);
          const canRemove = can.removeMember(access, membership);
          const canTransfer = can.transferOwnership(access) && !isSelf;
          return (
            <ListRow
              key={membership.id}
              leading={<EntityAvatar name={membership.user.name} src={membership.user.avatarUrl} />}
              title={
                <span className="flex items-center gap-2">
                  {membership.user.name}
                  {isSelf ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                </span>
              }
              subtitle={membership.user.email}
              trailing={
                <div className="flex items-center gap-1">
                  <Badge
                    variant={
                      membership.role === 'owner'
                        ? 'default'
                        : membership.role === 'administrator'
                          ? 'secondary'
                          : 'muted'
                    }
                  >
                    {ROLE_LABELS[membership.role]}
                  </Badge>
                  {canChange || canRemove || canTransfer ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${membership.user.name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canChange && membership.role === 'member' ? (
                          <DropdownMenuItem
                            onSelect={() => void changeRole(membership, 'administrator')}
                          >
                            <ShieldCheck /> Make administrator
                          </DropdownMenuItem>
                        ) : null}
                        {canChange && membership.role === 'administrator' ? (
                          <DropdownMenuItem onSelect={() => void changeRole(membership, 'member')}>
                            <ShieldCheck /> Make member
                          </DropdownMenuItem>
                        ) : null}
                        {canTransfer ? (
                          <DropdownMenuItem onSelect={() => setTransferring(membership)}>
                            <Share2 /> Transfer ownership
                          </DropdownMenuItem>
                        ) : null}
                        {canRemove ? (
                          <DropdownMenuItem destructive onSelect={() => setRemoving(membership)}>
                            <UserMinus /> Remove from church
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              }
            />
          );
        })}
      </ListGroup>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.user.name ?? ''}?`}
        description="They will lose access to this church. Their person record in the directory is kept but unlinked from their account."
        confirmLabel="Remove"
        loading={removeMember.isPending}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await removeMember.mutateAsync(removing.id);
            toast.success('Member removed');
            setRemoving(null);
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
      <Dialog
        open={!!transferring}
        onOpenChange={(open) => {
          if (!open) {
            setTransferring(null);
            setPassword('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              {transferring?.user.name} will become the owner and you will become an administrator.
              Confirm with your password.
            </DialogDescription>
          </DialogHeader>
          <Field label="Your password" htmlFor="transfer-password">
            <Input
              id="transfer-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTransferring(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!password}
              loading={transfer.isPending}
              onClick={async () => {
                if (!transferring) return;
                try {
                  await transfer.mutateAsync({ userId: transferring.userId, password });
                  toast.success('Ownership transferred');
                  setTransferring(null);
                  setPassword('');
                } catch (error) {
                  toast.error(getErrorMessage(error));
                }
              }}
            >
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InvitationsPanel() {
  const { churchId } = useChurch();
  const invitations = useQuery(invitationsQuery(churchId));
  const create = useCreateInvitation(churchId);
  const revoke = useRevokeInvitation(churchId);
  const [createOpen, setCreateOpen] = useState(false);
  const [role, setRole] = useState<'member' | 'administrator'>('member');
  const [label, setLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [maxUses, setMaxUses] = useState('');
  const [showing, setShowing] = useState<string | null>(null);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy. Long-press the link to copy it manually.');
    }
  };

  const share = async (url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join our church on TataGereja', url });
        return;
      } catch {
        // user cancelled
        return;
      }
    }
    await copy(url);
  };

  const submit = async () => {
    try {
      const result = await create.mutateAsync({
        role,
        label: label || null,
        expiresInDays: expiresInDays === '' ? null : Number(expiresInDays),
        maxUses: maxUses === '' ? null : Number(maxUses),
      });
      setCreateOpen(false);
      setLabel('');
      setMaxUses('');
      setShowing(result.invitation.id);
      toast.success('Invitation created');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const shown = invitations.data?.items.find((item) => item.id === showing) ?? null;

  return (
    <>
      <Section
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> New invitation
          </Button>
        }
      >
        {invitations.isPending ? (
          <PageLoader />
        ) : invitations.isError ? (
          <ErrorState
            message={getErrorMessage(invitations.error)}
            onRetry={() => void invitations.refetch()}
          />
        ) : invitations.data.items.length === 0 ? (
          <EmptyState
            icon={QrCode}
            title="No invitations yet"
            description="Create an invitation link or QR code so people can join your church."
          />
        ) : (
          <ListGroup>
            {invitations.data.items.map((invitation) => (
              <ListRow
                key={invitation.id}
                onClick={() => setShowing(invitation.id)}
                title={invitation.label || `${ROLE_LABELS[invitation.role]} invitation`}
                subtitle={`${invitation.useCount}${invitation.maxUses ? `/${invitation.maxUses}` : ''} used · ${
                  invitation.expiresAt
                    ? `expires ${formatDate(invitation.expiresAt)}`
                    : 'never expires'
                } · by ${invitation.createdByName}`}
                trailing={
                  <Badge
                    variant={invitation.status === 'active' ? 'success' : 'muted'}
                    className="capitalize"
                  >
                    {invitation.status}
                  </Badge>
                }
                chevron
              />
            ))}
          </ListGroup>
        )}
      </Section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New invitation</DialogTitle>
            <DialogDescription>
              Anyone with the link or QR code can join with the selected role until it expires or
              reaches its limit.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Role" htmlFor="invite-role">
              <Select
                id="invite-role"
                value={role}
                onChange={(event) => setRole(event.target.value as 'member' | 'administrator')}
              >
                <option value="member">Member</option>
                <option value="administrator">Administrator</option>
              </Select>
            </Field>
            <Field
              label="Label"
              htmlFor="invite-label"
              description="Optional, e.g. “Sunday bulletin QR”."
            >
              <Input
                id="invite-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={200}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Expires in (days)"
                htmlFor="invite-expires"
                description="Leave empty for no expiry."
              >
                <Input
                  id="invite-expires"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  value={expiresInDays}
                  onChange={(event) => setExpiresInDays(event.target.value)}
                />
              </Field>
              <Field
                label="Max uses"
                htmlFor="invite-uses"
                description="Leave empty for unlimited."
              >
                <Input
                  id="invite-uses"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10000}
                  value={maxUses}
                  onChange={(event) => setMaxUses(event.target.value)}
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!shown} onOpenChange={(open) => !open && setShowing(null)}>
        <DialogContent>
          {shown ? (
            <>
              <DialogHeader>
                <DialogTitle>{shown.label || `${ROLE_LABELS[shown.role]} invitation`}</DialogTitle>
                <DialogDescription>
                  Scan the QR code or share the link. Created {formatDateTime(shown.createdAt)}.
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="flex flex-col items-center gap-4">
                {shown.status !== 'active' ? (
                  <Alert variant="warning" className="w-full capitalize">
                    This invitation is {shown.status}.
                  </Alert>
                ) : null}
                <div className="rounded-2xl bg-white p-4 shadow-soft">
                  <QRCodeSVG value={shown.url} size={208} level="M" includeMargin={false} />
                </div>
                <p className="w-full truncate rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground select-all">
                  {shown.url}
                </p>
                <div className="grid w-full grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => void copy(shown.url)}>
                    <Copy /> Copy link
                  </Button>
                  <Button onClick={() => void share(shown.url)}>
                    <Share2 /> Share
                  </Button>
                </div>
              </DialogBody>
              {/* Keeps the destructive action away from the bottom edge on phones. */}
              <DialogFooter className="flex-col sm:flex-row">
                {!shown.revokedAt ? (
                  <Button
                    variant="destructive"
                    loading={revoke.isPending}
                    onClick={async () => {
                      try {
                        await revoke.mutateAsync(shown.id);
                        toast.success('Invitation revoked');
                      } catch (error) {
                        toast.error(getErrorMessage(error));
                      }
                    }}
                  >
                    <Trash2 /> Revoke
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => setShowing(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DangerPanel() {
  const { church, churchId, access } = useChurch();
  const navigate = useNavigate();
  const leave = useLeaveChurch(churchId);
  const remove = useDeleteChurch(churchId);
  const setLastChurchId = useUiStore((state) => state.setLastChurchId);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');

  return (
    <div className="flex flex-col gap-4">
      {can.leaveChurch(access) ? (
        <Card>
          <CardHeader>
            <CardTitle>Leave this church</CardTitle>
            <CardDescription>You will lose access until you are invited again.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setLeaveOpen(true)}>
              Leave {church.name}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Alert variant="info" title="You own this church">
          Transfer ownership to another member from the Members tab before leaving.
        </Alert>
      )}
      {can.deleteChurch(access) ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Delete this church</CardTitle>
            <CardDescription>
              Permanently deletes all people, groups, events, attendance and announcements. This
              cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 /> Delete church
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={`Leave ${church.name}?`}
        description="You can rejoin later with a new invitation."
        confirmLabel="Leave"
        loading={leave.isPending}
        onConfirm={async () => {
          try {
            await leave.mutateAsync();
            setLastChurchId(null);
            toast.success('You left the church');
            navigate('/churches', { replace: true });
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setPassword('');
        }}
        title={`Delete ${church.name}?`}
        description="Type your password to confirm. Everything in this church will be permanently deleted."
        confirmLabel="Delete forever"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!password) {
            toast.error('Enter your password to confirm');
            return;
          }
          try {
            await remove.mutateAsync(password);
            setLastChurchId(null);
            toast.success('Church deleted');
            navigate('/churches', { replace: true });
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      >
        <FormActions className="pt-0 sm:flex-col">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-label="Your password"
          />
        </FormActions>
      </ConfirmDialog>
    </div>
  );
}

export function ChurchSettingsPage() {
  const { church, base, isAdmin } = useChurch();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'profile';
  return (
    <Page>
      <PageHeader backTo={`${base}/more`} title="Church settings" description={church.name} />
      <Tabs value={tab} onValueChange={(value) => setParams({ tab: value }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          {isAdmin ? <TabsTrigger value="members">Members</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="invitations">Invites</TabsTrigger> : null}
          <TabsTrigger value="danger">More</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfilePanel />
        </TabsContent>
        {isAdmin ? (
          <TabsContent value="members">
            <MembersPanel />
          </TabsContent>
        ) : null}
        {isAdmin ? (
          <TabsContent value="invitations">
            <InvitationsPanel />
          </TabsContent>
        ) : null}
        <TabsContent value="danger">
          <DangerPanel />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
