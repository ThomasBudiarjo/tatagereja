import { canManageServices } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Crown, Plus, Sparkles, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCards } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { teamsQuery, useSetupWorship } from './api';
import { TeamDialog } from './team-dialogs';
import { WorshipNav } from './worship-ui';
import { WORSHIP_TONE, useWorshipMe } from './worship-lib';

export function TeamsPage() {
  const { churchId, base, access } = useChurch();
  const { t } = useI18n();
  const query = useQuery(teamsQuery(churchId));
  const me = useWorshipMe();
  const [creating, setCreating] = useState(false);
  const canManage = canManageServices(access);
  const setup = useMutationToast(useSetupWorship(churchId), {
    success: (result) =>
      t('worship.setupDone', { types: result.serviceTypes, teams: result.teams }),
  });
  const led = new Set(me.data?.ledTeamIds ?? []);
  const serving = new Set(me.data?.memberTeamIds ?? []);

  return (
    <Page size="wide">
      <PageHeader
        title={t('worship.teamsTitle')}
        description={t('worship.teamsDescription')}
        breadcrumbs={[
          { label: t('worship.nav'), to: `${base}/worship` },
          { label: t('worship.teamsTitle') },
        ]}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              {t('worship.newTeam')}
            </Button>
          ) : null
        }
      />
      <WorshipNav />
      {query.isPending ? (
        <SkeletonCards count={6} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          tone={WORSHIP_TONE}
          title={t('worship.noTeams')}
          description={canManage ? t('worship.noTeamsManage') : t('worship.noTeamsView')}
          action={
            canManage ? (
              <Button loading={setup.isPending} onClick={() => void setup.run(undefined)}>
                {!setup.isPending ? <Sparkles /> : null}
                {t('worship.setupAction')}
              </Button>
            ) : null
          }
          secondaryAction={
            canManage ? (
              <Button variant="outline" onClick={() => setCreating(true)}>
                <Plus />
                {t('worship.newTeam')}
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.items.map((team) => (
            <li key={team.id}>
              <Link
                to={`${base}/worship/teams/${team.id}`}
                className={cn(
                  'flex h-full flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-soft outline-none pressable hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  !team.isActive && 'opacity-70',
                )}
              >
                <div className="flex items-start gap-3">
                  <EntityAvatar name={team.name} color={team.color} size="md" square />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold tracking-tight">{team.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('worship.members', { count: team.memberCount })}
                    </p>
                  </div>
                  {led.has(team.id) ? (
                    <StatusBadge tone="amber" icon={Crown} size="sm">
                      {t('worship.youLead')}
                    </StatusBadge>
                  ) : serving.has(team.id) ? (
                    <StatusBadge tone={WORSHIP_TONE} size="sm">
                      {t('worship.youServe')}
                    </StatusBadge>
                  ) : null}
                </div>
                {team.description ? (
                  <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">
                    {team.description}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {team.positions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {t('worship.noPositions')}
                    </span>
                  ) : (
                    team.positions.map((position) => (
                      <span
                        key={position.id}
                        className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      >
                        {position.name}
                      </span>
                    ))
                  )}
                  {!team.isActive ? (
                    <StatusBadge tone="neutral" size="sm">
                      {t('worship.inactiveType')}
                    </StatusBadge>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canManage ? <TeamDialog open={creating} onOpenChange={setCreating} /> : null}
    </Page>
  );
}
