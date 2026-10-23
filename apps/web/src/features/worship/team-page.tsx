import {
  canManageServices,
  fullName,
  type ServingPosition,
  type ServingTeamMember,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarOff, Crown, Pencil, Plus, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DataList } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import {
  blockoutsQuery,
  teamQuery,
  useDeletePosition,
  useDeleteTeam,
  useRemoveTeamMember,
} from './api';
import { MemberDialog, PositionDialog, TeamDialog } from './team-dialogs';
import { WORSHIP_TONE } from './worship-lib';

export function TeamPage() {
  const { teamId = '' } = useParams();
  const { churchId, base, access } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(teamQuery(churchId, teamId));
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [position, setPosition] = useState<ServingPosition | 'new' | null>(null);
  const [removingPosition, setRemovingPosition] = useState<ServingPosition | null>(null);
  const [member, setMember] = useState<ServingTeamMember | 'new' | null>(null);
  const [removingMember, setRemovingMember] = useState<ServingTeamMember | null>(null);
  const deleteTeam = useMutationToast(useDeleteTeam(churchId), {
    success: t('worship.teamDeleted'),
  });
  const deletePosition = useMutationToast(useDeletePosition(churchId, teamId), {
    success: t('worship.positionDeleted'),
  });
  const removeMember = useMutationToast(useRemoveTeamMember(churchId, teamId), {
    success: t('worship.memberRemoved'),
  });
  const planner = canManageServices(access);
  const crumbs = [
    { label: t('worship.nav'), to: `${base}/worship` },
    { label: t('worship.teamsTitle'), to: `${base}/worship/teams` },
  ];

  if (query.isPending) {
    return (
      <Page size="wide">
        <SkeletonText lines={2} className="max-w-sm" />
        <SkeletonList rows={6} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page size="wide">
        <PageHeader title={t('worship.teamsTitle')} breadcrumbs={crumbs} />
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={
            isApiClientError(query.error) && query.error.status === 404
              ? undefined
              : () => void query.refetch()
          }
        />
      </Page>
    );
  }

  const { team, members, canManage, canSchedule } = query.data;
  const positionName = new Map(team.positions.map((item) => [item.id, item.name]));

  return (
    <Page size="wide">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <EntityAvatar name={team.name} color={team.color} size="lg" square />
            <span className="min-w-0">{team.name}</span>
          </span>
        }
        documentTitle={team.name}
        description={team.description ?? t('worship.members', { count: team.memberCount })}
        breadcrumbs={[...crumbs, { label: team.name }]}
        actions={
          planner ? (
            <>
              <Button
                size="sm"
                variant="outline"
                aria-label={t('worship.editTeam')}
                onClick={() => setEditing(true)}
              >
                <Pencil />
                <span className="hidden sm:inline">{t('common.edit')}</span>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-9 text-muted-foreground hover:text-destructive"
                aria-label={t('worship.deleteTeam')}
                onClick={() => setDeleting(true)}
              >
                <Trash2 />
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section
            title={t('worship.positions')}
            description={t('worship.positionsDescription')}
            action={
              canManage ? (
                <Button size="sm" variant="outline" onClick={() => setPosition('new')}>
                  <Plus />
                  {t('worship.addPosition')}
                </Button>
              ) : null
            }
          >
            {team.positions.length === 0 ? (
              <EmptyState
                compact
                icon={UsersRound}
                tone={WORSHIP_TONE}
                title={t('worship.noPositions')}
              />
            ) : (
              <DataList
                items={team.positions}
                getKey={(item) => item.id}
                title={(item) => item.name}
                subtitle={(item) => t('worship.needed', { count: item.needed })}
                trailing={(item) => (
                  <span className="inline-flex items-center gap-1 text-xs tabular">
                    <UsersRound className="size-3.5" aria-hidden />
                    {members.filter((entry) => entry.positionIds.includes(item.id)).length}
                  </span>
                )}
                actions={(item) => [
                  {
                    id: 'edit',
                    label: t('worship.editPosition'),
                    icon: Pencil,
                    hidden: !canManage,
                    onSelect: () => setPosition(item),
                  },
                  {
                    id: 'delete',
                    label: t('common.delete'),
                    icon: Trash2,
                    destructive: true,
                    hidden: !canManage,
                    onSelect: () => setRemovingPosition(item),
                  },
                ]}
              />
            )}
          </Section>
        </div>

        <Section
          title={t('worship.teamMembers')}
          description={t('worship.teamMembersDescription')}
          action={
            canManage ? (
              <Button size="sm" onClick={() => setMember('new')}>
                <UserPlus />
                {t('worship.addMember')}
              </Button>
            ) : null
          }
        >
          {members.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              tone={WORSHIP_TONE}
              title={t('worship.noMembers')}
              description={t('worship.noMembersBody')}
              action={
                canManage ? (
                  <Button onClick={() => setMember('new')}>
                    <UserPlus />
                    {t('worship.addMember')}
                  </Button>
                ) : null
              }
            />
          ) : (
            <DataList
              items={members}
              getKey={(item) => item.teamMemberId}
              leading={(item) => <EntityAvatar name={fullName(item)} src={item.photoUrl} />}
              title={(item) => (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{fullName(item)}</span>
                  {item.role === 'leader' ? (
                    <StatusBadge tone="amber" icon={Crown} size="sm">
                      {t('worship.leaderBadge')}
                    </StatusBadge>
                  ) : null}
                </span>
              )}
              subtitle={(item) =>
                item.positionIds.length === 0
                  ? t('worship.anyPosition')
                  : item.positionIds
                      .map((id) => positionName.get(id))
                      .filter(Boolean)
                      .join(', ')
              }
              onRowClick={canManage ? (item) => setMember(item) : undefined}
              actionsLabel={(item) => fullName(item)}
              actions={(item) => [
                {
                  id: 'edit',
                  label: t('worship.editMember'),
                  icon: Pencil,
                  hidden: !canManage,
                  onSelect: () => setMember(item),
                },
                {
                  id: 'remove',
                  label: t('common.remove'),
                  icon: Trash2,
                  destructive: true,
                  hidden: !canManage || (item.role === 'leader' && !planner),
                  onSelect: () => setRemovingMember(item),
                },
              ]}
            />
          )}
        </Section>
      </div>

      {canSchedule ? <TeamAvailability memberIds={members.map((item) => item.id)} /> : null}

      {planner ? <TeamDialog team={team} open={editing} onOpenChange={setEditing} /> : null}
      {canManage ? (
        <>
          <PositionDialog
            teamId={team.id}
            position={position && position !== 'new' ? position : undefined}
            open={position !== null}
            onOpenChange={(open) => (!open ? setPosition(null) : undefined)}
          />
          <MemberDialog
            team={team}
            member={member && member !== 'new' ? member : undefined}
            existingIds={members.map((item) => item.id)}
            open={member !== null}
            onOpenChange={(open) => (!open ? setMember(null) : undefined)}
          />
        </>
      ) : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('worship.deleteTeamTitle', { name: team.name })}
        description={t('worship.deleteTeamBody')}
        confirmLabel={t('worship.deleteTeam')}
        confirmText={team.name}
        loading={deleteTeam.isPending}
        onConfirm={async () => {
          if (await deleteTeam.run(team.id)) {
            setDeleting(false);
            void navigate(`${base}/worship/teams`, { replace: true });
          }
        }}
      />
      <ConfirmDialog
        open={!!removingPosition}
        onOpenChange={(open) => (!open ? setRemovingPosition(null) : undefined)}
        title={t('worship.deletePositionTitle', { name: removingPosition?.name ?? '' })}
        description={t('worship.deletePositionBody')}
        confirmLabel={t('common.delete')}
        loading={deletePosition.isPending}
        onConfirm={async () => {
          if (removingPosition && (await deletePosition.run(removingPosition.id))) {
            setRemovingPosition(null);
          }
        }}
      />
      <ConfirmDialog
        open={!!removingMember}
        onOpenChange={(open) => (!open ? setRemovingMember(null) : undefined)}
        title={t('worship.removeMemberTitle', {
          name: removingMember ? fullName(removingMember) : '',
          team: team.name,
        })}
        description={t('worship.removeMemberBody')}
        confirmLabel={t('common.remove')}
        loading={removeMember.isPending}
        onConfirm={async () => {
          if (removingMember && (await removeMember.run(removingMember.teamMemberId))) {
            setRemovingMember(null);
          }
        }}
      />
    </Page>
  );
}

/** Upcoming unavailable dates of the team's members, for whoever schedules the team. */
function TeamAvailability({ memberIds }: { memberIds: string[] }) {
  const { churchId } = useChurch();
  const { t, formatDate } = useI18n();
  const query = useQuery(blockoutsQuery(churchId, { scope: 'team' }));
  const items = (query.data?.items ?? []).filter((item) => memberIds.includes(item.personId));
  return (
    <Section title={t('worship.teamAvailability')} icon={CalendarOff}>
      {query.isPending ? (
        <SkeletonList rows={2} />
      ) : query.isError ? (
        <ErrorState
          compact
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          {t('worship.teamAvailabilityEmpty')}
        </p>
      ) : (
        <DataList
          items={items}
          getKey={(item) => item.id}
          leading={(item) => (
            <EntityAvatar name={fullName(item.person)} src={item.person.photoUrl} size="sm" />
          )}
          title={(item) => fullName(item.person)}
          subtitle={(item) =>
            [
              item.startDate === item.endDate
                ? formatDate(item.startDate, 'dateShort')
                : `${formatDate(item.startDate, 'dayMonth')} – ${formatDate(item.endDate, 'dateShort')}`,
              item.reason,
            ]
              .filter(Boolean)
              .join(' · ')
          }
        />
      )}
    </Section>
  );
}
