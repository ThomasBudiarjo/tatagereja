import {
  GROUP_TYPE_TEXT,
  fullName,
  localize,
  type GroupJoinRequest,
  type GroupPage as GroupPageData,
  type GroupRosterMember,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  CalendarDays,
  Check,
  ClipboardCheck,
  Crown,
  Download,
  Hourglass,
  Inbox,
  Lock,
  LogOut,
  MapPin,
  Megaphone,
  Pencil,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { AvatarGroup, EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/ui/list';
import { SearchInput } from '@/components/ui/misc';
import { RowActions } from '@/components/ui/row-actions';
import { Skeleton, SkeletonList } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { TabsContent, TabsList, TabsTrigger, UrlTabs } from '@/components/ui/tabs';
import { accountsQuery, downloadGroupRoster } from '@/features/people/api';
import { ContactButtons, GroupCover, PersonStatusBadge } from '@/features/people/people-ui';
import { PersonPickerDialog } from '@/features/people/person-picker';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isGone, useMutationToast } from '@/lib/use-mutation-toast';
import {
  groupQuery,
  useAddGroupLeader,
  useAddGroupMembers,
  useCancelJoinRequest,
  useDecideJoinRequest,
  useDeleteGroup,
  useLeaveGroup,
  useRemoveGroupLeader,
  useRemoveGroupMember,
  useRequestToJoin,
} from './api';
import { GroupFormDialog } from './group-form';
import { scheduleText } from './schedule';

type DialogName = 'edit' | 'delete' | 'add' | 'leader' | 'join' | 'leave' | null;

export function GroupPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(groupQuery(churchId, id));
  const [dialog, setDialog] = useState<DialogName>(null);
  const [exporting, setExporting] = useState(false);
  const remove = useMutationToast(useDeleteGroup(churchId));
  const leave = useMutationToast(useLeaveGroup(churchId, id), { success: t('groups.left') });
  const cancel = useMutationToast(useCancelJoinRequest(churchId, id), {
    success: t('groups.requestCancelled'),
  });
  const addMembers = useMutationToast(useAddGroupMembers(churchId, id), {
    success: (_data, variables) => t('groups.membersAdded', { count: variables.personIds.length }),
  });
  const close = (next: boolean) => {
    if (!next) setDialog(null);
  };

  if (query.isPending) {
    return (
      <Page size="wide">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-11 rounded-xl" />
        <SkeletonList rows={5} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader backTo={`${base}/groups`} title={t('groups.group')} />
        <ErrorState
          error={query.error}
          title={isGone(query.error) ? t('groups.gone') : undefined}
          message={getErrorMessage(query.error)}
          onRetry={isGone(query.error) ? undefined : () => void query.refetch()}
        />
      </Page>
    );
  }

  const page = query.data;
  const { group } = page;
  const canDecide = page.canManage;
  const tabs = ['members', ...(canDecide ? ['requests'] : []), 'activity'];

  const exportRoster = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadGroupRoster(churchId, group.id);
      toast.success(t('groups.rosterExported'));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Page size="wide">
      <PageHeader
        breadcrumbs={[{ label: t('groups.title'), to: `${base}/groups` }, { label: group.name }]}
        title={<span className="sr-only">{group.name}</span>}
        documentTitle={group.name}
        className="-mb-2"
        actions={
          page.canManage || page.canDelete ? (
            <>
              {page.canManage ? (
                <Button size="sm" variant="outline" onClick={() => setDialog('edit')}>
                  <Pencil /> <span className="hidden sm:inline">{t('common.edit')}</span>
                </Button>
              ) : null}
              <RowActions
                className="size-9 border border-input bg-card"
                actions={[
                  {
                    id: 'export',
                    label: t('groups.exportRoster'),
                    icon: Download,
                    hidden: !page.canExport,
                    disabled: exporting,
                    onSelect: () => void exportRoster(),
                  },
                  {
                    id: 'leader',
                    label: t('groups.addLeader'),
                    icon: Crown,
                    hidden: !page.canAssignLeaders,
                    onSelect: () => setDialog('leader'),
                  },
                  {
                    id: 'delete',
                    label: t('groups.delete'),
                    icon: Trash2,
                    destructive: true,
                    hidden: !page.canDelete,
                    onSelect: () => setDialog('delete'),
                  },
                ]}
              />
            </>
          ) : null
        }
      />

      <GroupHero
        page={page}
        onJoin={() => setDialog('join')}
        onCancel={() => void cancel.run()}
        cancelling={cancel.isPending}
        onLeave={() => setDialog('leave')}
      />

      <UrlTabs defaultValue="members" values={tabs}>
        <TabsList variant="underline">
          <TabsTrigger value="members">
            {t('groups.tabMembers')}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular">
              {page.members.length}
            </span>
          </TabsTrigger>
          {canDecide ? (
            <TabsTrigger value="requests">
              {t('groups.tabRequests')}
              {page.joinRequests.length > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular">
                  {page.joinRequests.length}
                </span>
              ) : null}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="activity">{t('groups.tabActivity')}</TabsTrigger>
        </TabsList>
        <TabsContent value="members">
          <MembersTab page={page} onAdd={() => setDialog('add')} />
        </TabsContent>
        {canDecide ? (
          <TabsContent value="requests">
            <RequestsList groupId={group.id} requests={page.joinRequests} />
          </TabsContent>
        ) : null}
        <TabsContent value="activity">
          <ActivityTab page={page} />
        </TabsContent>
      </UrlTabs>

      {page.canManage ? (
        <>
          <GroupFormDialog
            key={group.updatedAt}
            group={group}
            open={dialog === 'edit'}
            onOpenChange={close}
          />
          <PersonPickerDialog
            churchId={churchId}
            open={dialog === 'add'}
            onOpenChange={close}
            title={t('groups.addMembers')}
            description={
              group.capacity
                ? t('groups.addMembersCapacity', {
                    left: Math.max(0, group.capacity - group.memberCount),
                  })
                : t('groups.addMembersHint')
            }
            excludeIds={page.members.map((member) => member.id)}
            loading={addMembers.isPending}
            onConfirm={async (personIds) => {
              if (await addMembers.run({ personIds })) setDialog(null);
            }}
          />
        </>
      ) : null}
      {page.canAssignLeaders ? (
        <LeaderDialog
          groupId={group.id}
          existing={group.leaders.map((leader) => leader.userId)}
          open={dialog === 'leader'}
          onOpenChange={close}
        />
      ) : null}
      {page.canRequestToJoin ? (
        <JoinDialog page={page} open={dialog === 'join'} onOpenChange={close} />
      ) : null}
      <ConfirmDialog
        open={dialog === 'leave'}
        onOpenChange={close}
        title={t('groups.leaveTitle', { name: group.name })}
        description={
          group.visibility === 'private' ? t('groups.leavePrivate') : t('groups.leaveDescription')
        }
        confirmLabel={t('groups.leave')}
        loading={leave.isPending}
        onConfirm={async () => {
          if (await leave.run()) setDialog(null);
        }}
      />
      {page.canDelete ? (
        <ConfirmDialog
          open={dialog === 'delete'}
          onOpenChange={close}
          title={t('groups.deleteTitle', { name: group.name })}
          description={t('groups.deleteDescription')}
          confirmText={group.name}
          confirmLabel={t('groups.delete')}
          loading={remove.isPending}
          onConfirm={async () => {
            if (await remove.run(group.id)) {
              toast.success(t('groups.deleted', { name: group.name }));
              navigate(`${base}/groups`, { replace: true });
            }
          }}
        />
      ) : null}
    </Page>
  );
}

function GroupHero({
  page,
  onJoin,
  onCancel,
  cancelling,
  onLeave,
}: {
  page: GroupPageData;
  onJoin: () => void;
  onCancel: () => void;
  cancelling: boolean;
  onLeave: () => void;
}) {
  const { t, locale } = useI18n();
  const { group } = page;
  const schedule = scheduleText(group, locale);
  return (
    <Card className="overflow-hidden">
      <div
        aria-hidden
        className="h-20 bg-gradient-to-br from-violet-500/25 via-primary/15 to-sky-500/20 sm:h-24"
        style={
          group.coverColor
            ? {
                background: `linear-gradient(135deg, ${group.coverColor}, color-mix(in oklab, ${group.coverColor} 45%, transparent))`,
              }
            : undefined
        }
      />
      <CardContent className="-mt-10 flex flex-col gap-4 sm:-mt-11 sm:flex-row sm:items-end">
        <GroupCover
          type={group.type}
          color={group.coverColor}
          size="lg"
          className="size-16 rounded-2xl ring-4 ring-card [&>svg]:size-8"
        />
        <div className="min-w-0 flex-1">
          <p
            aria-hidden
            className="text-2xl leading-tight font-bold tracking-tight text-balance sm:text-[1.75rem]"
          >
            {group.name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{localize(GROUP_TYPE_TEXT[group.type], locale)}</span>
            {group.visibility === 'private' ? (
              <span className="flex items-center gap-1">
                <Lock className="size-3.5" aria-hidden /> {t('groups.private')}
              </span>
            ) : null}
            {!group.isActive ? <StatusBadge size="sm">{t('groups.inactive')}</StatusBadge> : null}
            {schedule ? (
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3.5" aria-hidden /> {schedule}
              </span>
            ) : null}
            {group.location ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {group.location}
              </span>
            ) : null}
          </div>
          {group.description ? (
            <p className="mt-2 max-w-2xl text-sm text-pretty">{group.description}</p>
          ) : null}
          {group.leaders.length > 0 ? (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <AvatarGroup
                people={group.leaders.map((leader) => ({
                  id: leader.userId,
                  name: leader.name,
                  src: leader.avatarUrl,
                }))}
                size="xs"
              />
              <span className="truncate text-muted-foreground">
                {t('groups.ledBy', {
                  names: group.leaders.map((leader) => leader.name).join(', '),
                })}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {page.canRequestToJoin ? (
            <Button onClick={onJoin}>
              <UserPlus /> {t('groups.askToJoin')}
            </Button>
          ) : group.myState === 'pending' ? (
            <>
              <StatusBadge tone="warning" icon={Hourglass} className="h-9 px-3 text-sm">
                {t('groups.requested')}
              </StatusBadge>
              <Button variant="ghost" size="sm" onClick={onCancel} loading={cancelling}>
                {t('groups.cancelRequest')}
              </Button>
            </>
          ) : page.canLeave ? (
            <Button variant="outline" size="sm" onClick={onLeave}>
              <LogOut /> {t('groups.leave')}
            </Button>
          ) : null}
        </div>
      </CardContent>
      {page.myRequest?.status === 'declined' && group.myState === 'none' ? (
        <p className="border-t border-border/60 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          {t('groups.declinedNotice')}
          {page.myRequest.decisionNote ? ` “${page.myRequest.decisionNote}”` : ''}
        </p>
      ) : null}
    </Card>
  );
}

function MembersTab({ page, onAdd }: { page: GroupPageData; onAdd: () => void }) {
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState<GroupRosterMember | null>(null);
  const removeMember = useMutationToast(useRemoveGroupMember(churchId, page.group.id));
  const removeLeader = useMutationToast(useRemoveGroupLeader(churchId, page.group.id), {
    success: t('groups.leaderRemoved'),
  });
  const needle = search.trim().toLowerCase();
  const members = page.members.filter(
    (member) => !needle || fullName(member).toLowerCase().includes(needle),
  );
  const { group } = page;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('groups.searchMembers')}
          className="min-w-0 flex-1"
        />
        {page.canManage ? (
          <Button
            onClick={onAdd}
            disabled={group.capacity !== null && group.memberCount >= group.capacity}
          >
            <UserPlus /> <span className="hidden sm:inline">{t('groups.addMembers')}</span>
          </Button>
        ) : null}
      </div>
      {group.capacity !== null && group.memberCount >= group.capacity && page.canManage ? (
        <p className="text-sm text-muted-foreground">{t('groups.full')}</p>
      ) : null}
      {page.members.length === 0 ? (
        <EmptyState
          icon={Users}
          tone="violet"
          title={t('groups.noMembers')}
          description={page.canManage ? t('groups.noMembersManage') : t('groups.noMembersHint')}
          action={
            page.canManage ? (
              <Button onClick={onAdd}>
                <UserPlus /> {t('groups.addMembers')}
              </Button>
            ) : null
          }
        />
      ) : members.length === 0 ? (
        <EmptyState compact icon={Users} tone="violet" title={t('groups.noMemberMatches')} />
      ) : (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
          {members.map((member) => {
            const name = fullName(member);
            return (
              <li key={member.id} className="flex items-center gap-2 pr-2">
                <Link
                  to={`${base}/people/${member.id}`}
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60"
                >
                  <EntityAvatar name={name} src={member.photoUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{name}</span>
                      {member.isLeader ? (
                        <StatusBadge size="sm" tone="amber" icon={Crown}>
                          {t('groups.leader')}
                        </StatusBadge>
                      ) : null}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {member.phone ?? member.email ?? ' '}
                    </p>
                  </div>
                  <PersonStatusBadge
                    status={member.membershipStatus}
                    size="sm"
                    className="hidden sm:inline-flex"
                  />
                </Link>
                {page.canManage ? (
                  <ContactButtons phone={member.phone} email={null} className="hidden md:flex" />
                ) : null}
                {page.canManage ? (
                  <RowActions
                    label={t('groups.actionsFor', { name })}
                    actions={[
                      {
                        id: 'remove',
                        label: t('groups.removeMember'),
                        icon: UserMinus,
                        destructive: true,
                        onSelect: () => setRemoving(member),
                      },
                    ]}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {page.canAssignLeaders && group.leaders.length > 0 ? (
        <Section title={t('groups.leaders')} icon={Crown}>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
            {group.leaders.map((leader) => (
              <li key={leader.userId} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                <EntityAvatar name={leader.name} src={leader.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{leader.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{leader.email}</p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('groups.removeLeader', { name: leader.name })}
                  disabled={removeLeader.isPending}
                  onClick={() => void removeLeader.run(leader.userId)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(next) => !next && setRemoving(null)}
        title={t('groups.removeTitle', { name: removing ? fullName(removing) : '' })}
        description={t('groups.removeDescription', { group: group.name })}
        confirmLabel={t('groups.removeMember')}
        loading={removeMember.isPending}
        onConfirm={async () => {
          if (!removing) return;
          if (await removeMember.run(removing.id)) {
            toast.success(t('groups.memberRemoved', { name: fullName(removing) }));
            setRemoving(null);
          }
        }}
      />
    </div>
  );
}

export function RequestsList({
  groupId,
  requests,
  showGroup = false,
}: {
  groupId?: string;
  requests: GroupJoinRequest[];
  showGroup?: boolean;
}) {
  const { t } = useI18n();
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        tone="violet"
        title={t('groups.noRequests')}
        description={t('groups.noRequestsHint')}
      />
    );
  }
  return (
    <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
      {requests.map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          groupId={groupId ?? request.groupId}
          showGroup={showGroup}
        />
      ))}
    </ul>
  );
}

function RequestRow({
  request,
  groupId,
  showGroup,
}: {
  request: GroupJoinRequest;
  groupId: string;
  showGroup: boolean;
}) {
  const { churchId, base } = useChurch();
  const { t, formatRelative } = useI18n();
  const decide = useDecideJoinRequest(churchId, groupId);
  const name = fullName(request.person);
  const run = (decision: 'approved' | 'declined') =>
    decide.mutate(
      { requestId: request.id, decision },
      {
        onSuccess: () =>
          toast.success(
            decision === 'approved'
              ? t('groups.approved', { name, group: request.groupName })
              : t('groups.declined', { name }),
          ),
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <Link
        to={`${base}/people/${request.person.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <EntityAvatar name={name} src={request.person.photoUrl} />
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {showGroup ? `${request.groupName} · ` : ''}
            {formatRelative(request.createdAt)}
          </p>
          {request.message ? <p className="mt-1 text-sm text-pretty">“{request.message}”</p> : null}
        </div>
      </Link>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={decide.isPending}
          onClick={() => run('declined')}
        >
          <X /> {t('groups.decline')}
        </Button>
        <Button size="sm" disabled={decide.isPending} onClick={() => run('approved')}>
          <Check /> {t('groups.approve')}
        </Button>
      </div>
    </li>
  );
}

function ActivityTab({ page }: { page: GroupPageData }) {
  const { base } = useChurch();
  const { t, formatDate, formatPercent, formatRelative } = useI18n();
  const { stats, group } = page;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label={t('groups.statEvents')}
          value={stats.eventCount}
          icon={CalendarDays}
          tone="amber"
          to={`${base}/events?groupId=${group.id}`}
        />
        {stats.attendance ? (
          <StatCard
            label={t('groups.statAttendance')}
            value={stats.attendance.rate === null ? '—' : formatPercent(stats.attendance.rate)}
            hint={
              stats.attendance.lastSessionAt
                ? t('groups.lastSession', { when: formatRelative(stats.attendance.lastSessionAt) })
                : t('groups.noSessions')
            }
            icon={ClipboardCheck}
            tone="teal"
            to={`${base}/attendance?groupId=${group.id}`}
          />
        ) : null}
        <StatCard
          label={t('groups.statAnnouncements')}
          value={stats.recentAnnouncements.length}
          icon={Megaphone}
          tone="rose"
          to={`${base}/announcements?groupId=${group.id}`}
          className={stats.attendance ? 'col-span-2 lg:col-span-1' : undefined}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title={t('groups.upcomingEvents')}
          action={
            <Button asChild variant="link" size="sm">
              <Link to={`${base}/events?groupId=${group.id}`}>{t('common.seeAll')}</Link>
            </Button>
          }
        >
          {stats.upcomingEvents.length === 0 ? (
            <EmptyState compact icon={CalendarDays} tone="amber" title={t('groups.noEvents')} />
          ) : (
            <ListGroup>
              {stats.upcomingEvents.map((event) => (
                <ListRow
                  key={event.id}
                  to={`${base}/events/${event.id}`}
                  title={event.title}
                  subtitle={formatDate(event.startsAt, 'dateTime')}
                />
              ))}
            </ListGroup>
          )}
        </Section>
        <Section
          title={t('groups.recentAnnouncements')}
          action={
            <Button asChild variant="link" size="sm">
              <Link to={`${base}/announcements?groupId=${group.id}`}>{t('common.seeAll')}</Link>
            </Button>
          }
        >
          {stats.recentAnnouncements.length === 0 ? (
            <EmptyState compact icon={Megaphone} tone="rose" title={t('groups.noAnnouncements')} />
          ) : (
            <ListGroup>
              {stats.recentAnnouncements.map((announcement) => (
                <ListRow
                  key={announcement.id}
                  to={`${base}/announcements/${announcement.id}`}
                  title={announcement.title}
                  subtitle={
                    announcement.publishedAt ? formatRelative(announcement.publishedAt) : undefined
                  }
                />
              ))}
            </ListGroup>
          )}
        </Section>
      </div>
    </div>
  );
}

function JoinDialog({
  page,
  open,
  onOpenChange,
}: {
  page: GroupPageData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const join = useMutationToast(useRequestToJoin(churchId, page.group.id), {
    success: t('groups.requestSent'),
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !join.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('groups.askToJoinTitle', { name: page.group.name })}</DialogTitle>
          <DialogDescription>{t('groups.askToJoinHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field
            label={t('groups.message')}
            htmlFor="join-message"
            description={t('common.optional')}
          >
            <Textarea
              id="join-message"
              rows={3}
              maxLength={500}
              autoFocus
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t('groups.messagePlaceholder')}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={join.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={join.isPending}
            onClick={async () => {
              if (await join.run({ message })) {
                setMessage('');
                onOpenChange(false);
              }
            }}
          >
            {t('groups.sendRequest')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaderDialog({
  groupId,
  existing,
  open,
  onOpenChange,
}: {
  groupId: string;
  existing: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const accounts = useQuery({ ...accountsQuery(churchId), enabled: open });
  const add = useMutationToast(useAddGroupLeader(churchId, groupId), {
    success: t('groups.leaderAdded'),
  });
  const [userId, setUserId] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => !add.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('groups.addLeader')}</DialogTitle>
          <DialogDescription>{t('groups.addLeaderHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label={t('groups.account')} htmlFor="leader-user">
            <Combobox
              id="leader-user"
              value={userId}
              onChange={setUserId}
              loading={accounts.isPending}
              options={(accounts.data?.items ?? [])
                .filter((account) => !existing.includes(account.userId))
                .map((account) => ({
                  value: account.userId,
                  label: account.name,
                  description: account.email,
                  leading: <EntityAvatar name={account.name} src={account.avatarUrl} size="xs" />,
                  keywords: [account.email],
                }))}
              placeholder={t('groups.chooseAccount')}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={add.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!userId}
            loading={add.isPending}
            onClick={async () => {
              if (userId && (await add.run({ userId }))) {
                setUserId(null);
                onOpenChange(false);
              }
            }}
          >
            {t('groups.addLeader')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
