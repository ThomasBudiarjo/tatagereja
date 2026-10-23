import {
  fullName,
  type RosterAssignment,
  type ServingPosition,
  type ServingTeam,
  type WorshipServiceDetail,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Plus, Trash2, UserPlus, UsersRound, WandSparkles, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { RowActions } from '@/components/ui/row-actions';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import {
  suggestionsQuery,
  teamsQuery,
  useAssignRoster,
  useAutoFillRoster,
  useCopyRoster,
  useRemoveAssignment,
  useRespondToAssignment,
} from './api';
import { DeclineDialog, RespondButtons } from './respond';
import { ConflictBadges, PersonChip, PersonSelect, RosterStatusBadge } from './worship-ui';
import { WORSHIP_TONE, useWorshipMe } from './worship-lib';

type Entry = { positionId: string; personId: string };

/**
 * Jadwal pelayanan of one service, team by team and position by position. Schedulers fill
 * open positions from suggestions, copy the previous roster or fill everything at once;
 * volunteers answer their own assignments here too.
 */
export function RosterPanel({ detail }: { detail: WorshipServiceDetail }) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const { service, roster, schedulableTeamIds } = detail;
  const teams = useQuery(teamsQuery(churchId));
  const me = useWorshipMe();
  const [extraTeams, setExtraTeams] = useState<string[]>([]);
  const [assigning, setAssigning] = useState<{
    team: ServingTeam;
    position: ServingPosition;
  } | null>(null);
  const [conflict, setConflict] = useState<{ entries: Entry[]; messages: string[] } | null>(null);
  const [copying, setCopying] = useState(false);
  const open = service.status !== 'cancelled';
  const canScheduleAny = open && schedulableTeamIds.length > 0;

  const assignMutation = useAssignRoster(churchId, service.id);
  const assign = async (entries: Entry[], ignoreConflicts = false) => {
    try {
      const result = await assignMutation.mutateAsync({ assignments: entries, ignoreConflicts });
      const first = result.items[0];
      if (first) toast.success(t('worship.assigned', { name: fullName(first.person) }));
      setAssigning(null);
      setConflict(null);
      return true;
    } catch (error) {
      if (isApiClientError(error) && error.code === 'SCHEDULING_CONFLICT') {
        setConflict({ entries, messages: error.issues.map((issue) => issue.message) });
      } else {
        toast.error(getErrorMessage(error));
      }
      return false;
    }
  };

  const autoFill = useMutationToast(useAutoFillRoster(churchId, service.id), {
    success: (result) =>
      [
        t('worship.autoFilled', { count: result.items.length }),
        result.skipped > 0 ? t('worship.autoFillLeft', { count: result.skipped }) : null,
      ]
        .filter(Boolean)
        .join(' · '),
  });
  const copy = useMutationToast(useCopyRoster(churchId, service.id), {
    success: (result) =>
      [
        t('worship.rosterCopied', { count: result.items.length }),
        result.skipped > 0 ? t('worship.rosterCopySkipped', { count: result.skipped }) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    error: (error) =>
      isApiClientError(error) && error.status === 404
        ? t('worship.noEarlierRoster')
        : getErrorMessage(error),
  });

  if (teams.isPending) return <SkeletonList rows={4} />;
  if (teams.isError) {
    return (
      <ErrorState
        error={teams.error}
        message={getErrorMessage(teams.error)}
        onRetry={() => void teams.refetch()}
      />
    );
  }

  const onRoster = new Set(roster.map((item) => item.teamId));
  const shown = teams.data.items.filter(
    (team) =>
      onRoster.has(team.id) ||
      (extraTeams.includes(team.id) && schedulableTeamIds.includes(team.id)),
  );
  const addable = canScheduleAny
    ? teams.data.items.filter(
        (team) =>
          team.isActive &&
          schedulableTeamIds.includes(team.id) &&
          !shown.some((item) => item.id === team.id),
      )
    : [];
  const counts = {
    accepted: roster.filter((item) => item.status === 'accepted').length,
    pending: roster.filter((item) => item.status === 'pending').length,
    declined: roster.filter((item) => item.status === 'declined').length,
  };

  if (teams.data.items.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        tone={WORSHIP_TONE}
        title={t('worship.noTeams')}
        description={t('worship.noTeamsBody')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground tabular">
          {t('worship.rosterSummary', counts)}
        </p>
        {canScheduleAny ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setCopying(true)}>
              <Copy />
              {t('worship.copyRoster')}
            </Button>
            <Button
              size="sm"
              variant="soft"
              loading={autoFill.isPending}
              onClick={() => void autoFill.run({})}
            >
              {!autoFill.isPending ? <WandSparkles /> : null}
              {t('worship.autoFill')}
            </Button>
          </div>
        ) : null}
      </div>

      {shown.length === 0 && addable.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          tone={WORSHIP_TONE}
          title={t('worship.noRosterView')}
          compact
        />
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {shown.map((team) => (
          <TeamRoster
            key={team.id}
            team={team}
            assignments={roster.filter((item) => item.teamId === team.id)}
            canSchedule={open && schedulableTeamIds.includes(team.id)}
            myPersonId={open ? (me.data?.personId ?? null) : null}
            onAssign={(position) => setAssigning({ team, position })}
            onAutoFill={() => void autoFill.run({ teamId: team.id })}
            autoFilling={autoFill.isPending}
          />
        ))}
      </div>

      {addable.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3.5">
          <p className="text-sm font-medium">{t('worship.teamNotOnRoster')}</p>
          <div className="flex flex-wrap gap-2">
            {addable.map((team) => (
              <Button
                key={team.id}
                variant="outline"
                size="sm"
                onClick={() => setExtraTeams((list) => [...list, team.id])}
              >
                <Plus />
                {team.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {assigning ? (
        <AssignDialog
          serviceId={service.id}
          team={assigning.team}
          position={assigning.position}
          busy={assignMutation.isPending}
          onClose={() => setAssigning(null)}
          onAssign={(personId) => assign([{ positionId: assigning.position.id, personId }])}
        />
      ) : null}

      <ConfirmDialog
        open={!!conflict}
        onOpenChange={(next) => (!next ? setConflict(null) : undefined)}
        title={t('worship.conflictTitle')}
        description={t('worship.conflictBody')}
        confirmLabel={t('worship.assignAnyway')}
        variant="default"
        loading={assignMutation.isPending}
        onConfirm={() => (conflict ? void assign(conflict.entries, true) : undefined)}
      >
        <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/60 p-3 text-sm">
          {conflict?.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={copying}
        onOpenChange={setCopying}
        title={t('worship.copyRosterTitle')}
        description={t('worship.copyRosterBody')}
        confirmLabel={t('worship.copyRoster')}
        variant="default"
        loading={copy.isPending}
        onConfirm={async () => {
          await copy.run({});
          setCopying(false);
        }}
      />
    </div>
  );
}

function TeamRoster({
  team,
  assignments,
  canSchedule,
  myPersonId,
  onAssign,
  onAutoFill,
  autoFilling,
}: {
  team: ServingTeam;
  assignments: RosterAssignment[];
  canSchedule: boolean;
  myPersonId: string | null;
  onAssign: (position: ServingPosition) => void;
  onAutoFill: () => void;
  autoFilling: boolean;
}) {
  const { t } = useI18n();
  const needed = team.positions.reduce((total, position) => total + position.needed, 0);
  const filled = assignments.filter((item) => item.status !== 'declined').length;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
        <EntityAvatar name={team.name} color={team.color} size="sm" square />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold tracking-tight">{team.name}</p>
          <p className="text-xs text-muted-foreground tabular">
            {t('worship.filled', { filled, needed })}
          </p>
        </div>
        {canSchedule ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={autoFilling}
            onClick={onAutoFill}
            aria-label={t('worship.autoFillTeam', { team: team.name })}
          >
            <WandSparkles />
            <span className="hidden sm:inline">
              {t('worship.autoFillTeam', { team: team.name })}
            </span>
          </Button>
        ) : null}
      </div>
      <ul className="divide-y divide-border/70">
        {team.positions.map((position) => {
          const rows = assignments.filter((item) => item.positionId === position.id);
          const openSlots = Math.max(
            0,
            position.needed - rows.filter((item) => item.status !== 'declined').length,
          );
          return (
            <li key={position.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:gap-4">
              <div className="flex items-center justify-between gap-2 sm:w-32 sm:shrink-0 sm:flex-col sm:items-start sm:justify-start">
                <p className="text-sm font-medium">{position.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t('worship.needed', { count: position.needed })}
                </p>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {rows.map((assignment) => (
                  <AssignmentRow
                    key={assignment.id}
                    assignment={assignment}
                    canSchedule={canSchedule}
                    isMine={!!myPersonId && assignment.person.id === myPersonId}
                  />
                ))}
                {Array.from({ length: openSlots }).map((_, index) =>
                  canSchedule ? (
                    <button
                      key={`open-${index}`}
                      type="button"
                      onClick={() => onAssign(position)}
                      className="flex min-h-11 items-center gap-2.5 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors outline-none hover:border-primary/40 hover:bg-accent/40 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30"
                    >
                      <UserPlus className="size-4" aria-hidden />
                      <span>{t('worship.openSlot')}</span>
                      <span className="ml-auto font-medium text-primary">
                        {t('worship.assign')}
                      </span>
                    </button>
                  ) : (
                    <p
                      key={`open-${index}`}
                      className="flex min-h-9 items-center rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground"
                    >
                      {t('worship.open')}
                    </p>
                  ),
                )}
                {canSchedule && openSlots === 0 ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="hidden w-fit text-muted-foreground sm:inline-flex"
                    onClick={() => onAssign(position)}
                  >
                    <Plus />
                    {t('worship.assign')}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
        {team.positions.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted-foreground">{t('worship.noPositions')}</li>
        ) : null}
      </ul>
    </Card>
  );
}

function AssignmentRow({
  assignment,
  canSchedule,
  isMine,
}: {
  assignment: RosterAssignment;
  canSchedule: boolean;
  isMine: boolean;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const [removing, setRemoving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const remove = useMutationToast(useRemoveAssignment(churchId), {
    success: t('worship.assignmentRemoved'),
  });
  const respond = useMutationToast(useRespondToAssignment(churchId), {
    success: t('common.saved'),
  });
  const name = fullName(assignment.person);
  return (
    <div
      className={cn(
        'flex min-w-0 items-start gap-2 rounded-lg bg-muted/40 py-2 pr-1 pl-3 sm:items-center',
        assignment.status === 'declined' && 'bg-destructive/[0.05]',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
          <PersonChip person={assignment.person} size="xs" />
          <RosterStatusBadge status={assignment.status} />
        </div>
        {assignment.status === 'declined' && assignment.declineReason ? (
          <p className="text-xs text-muted-foreground">
            {t('worship.reasonShown', { reason: assignment.declineReason })}
          </p>
        ) : null}
        <ConflictBadges conflicts={assignment.conflicts} hideDeclined />
        {isMine && assignment.status === 'pending' ? (
          <RespondButtons assignment={assignment} className="mt-1 sm:hidden" />
        ) : null}
      </div>
      {isMine && assignment.status === 'pending' ? (
        <RespondButtons assignment={assignment} className="hidden sm:flex" />
      ) : null}
      {canSchedule ? (
        <RowActions
          label={name}
          actions={[
            {
              id: 'accept',
              label: t('worship.markAccepted'),
              icon: Check,
              hidden: assignment.status === 'accepted',
              onSelect: () =>
                void respond.run({ id: assignment.id, status: 'accepted', reason: null }),
            },
            {
              id: 'decline',
              label: t('worship.markDeclined'),
              icon: X,
              hidden: assignment.status === 'declined',
              onSelect: () => setDeclining(true),
            },
            {
              id: 'remove',
              label: t('worship.removeAssignment'),
              icon: Trash2,
              destructive: true,
              onSelect: () => setRemoving(true),
            },
          ]}
        />
      ) : null}
      <DeclineDialog assignment={assignment} open={declining} onOpenChange={setDeclining} />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t('worship.removeAssignmentTitle', { name, position: assignment.positionName })}
        description={t('worship.removeAssignmentBody')}
        confirmLabel={t('worship.removeAssignment')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(assignment.id)) setRemoving(false);
        }}
      />
    </div>
  );
}

/** Suggested team members first (fairest rotation), then anyone from the directory. */
function AssignDialog({
  serviceId,
  team,
  position,
  busy,
  onClose,
  onAssign,
}: {
  serviceId: string;
  team: ServingTeam;
  position: ServingPosition;
  busy: boolean;
  onClose: () => void;
  onAssign: (personId: string) => Promise<boolean>;
}) {
  const { churchId } = useChurch();
  const { t, formatRelative } = useI18n();
  const suggestions = useQuery(suggestionsQuery(churchId, serviceId, position.id));
  const [other, setOther] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const candidates = suggestions.data?.items[0]?.candidates ?? [];
  const choose = async (personId: string) => {
    setPicked(personId);
    await onAssign(personId);
    setPicked(null);
  };
  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('worship.assignTo', { position: `${team.name} · ${position.name}` })}
          </DialogTitle>
          <DialogDescription>{t('worship.assignDescription')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex max-h-[55dvh] min-h-40 flex-col gap-4">
          <section className="flex flex-col gap-1.5">
            <h3 className="text-overline text-muted-foreground">{t('worship.suggested')}</h3>
            {suggestions.isPending ? (
              <SkeletonList rows={3} />
            ) : suggestions.isError ? (
              <ErrorState
                compact
                message={getErrorMessage(suggestions.error)}
                onRetry={() => void suggestions.refetch()}
              />
            ) : candidates.length === 0 ? (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                {t('worship.noCandidates')}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {candidates.map((candidate, index) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void choose(candidate.id)}
                      className={cn(
                        'flex min-h-14 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-60',
                        index === 0 && candidate.conflicts.length === 0 && 'bg-accent/50',
                      )}
                    >
                      <EntityAvatar name={fullName(candidate)} src={candidate.photoUrl} size="sm" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium">{fullName(candidate)}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {t('worship.timesServed', { count: candidate.timesServed })}
                          {candidate.lastServedAt
                            ? ` · ${t('worship.lastServed', { when: formatRelative(candidate.lastServedAt) })}`
                            : ''}
                        </span>
                        <ConflictBadges conflicts={candidate.conflicts} />
                      </span>
                      {picked === candidate.id && busy ? null : (
                        <span className="text-sm font-medium text-primary">
                          {t('worship.assign')}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-overline text-muted-foreground">{t('worship.searchAnyone')}</h3>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <PersonSelect
                  value={other}
                  onChange={(personId) => setOther(personId)}
                  placeholder={t('worship.searchAnyonePlaceholder')}
                />
              </div>
              <Button
                disabled={!other}
                loading={busy && picked === other}
                onClick={() => (other ? void choose(other) : undefined)}
              >
                {t('worship.assign')}
              </Button>
            </div>
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
