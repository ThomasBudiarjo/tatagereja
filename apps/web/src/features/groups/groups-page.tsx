import {
  GROUP_TYPES,
  GROUP_TYPE_TEXT,
  can,
  localize,
  type GroupDetails,
  type GroupType,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarClock,
  Crown,
  Hourglass,
  Inbox,
  Lock,
  MapPin,
  Plus,
  SlidersHorizontal,
  UserCheck,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { AvatarGroup } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { Segmented } from '@/components/ui/misc';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { directoryMeQuery } from '@/features/people/api';
import { GROUP_TYPE_STYLE } from '@/features/people/labels';
import { GroupCover } from '@/features/people/people-ui';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { groupsQuery } from './api';
import { GroupFormDialog } from './group-form';
import { scheduleText } from './schedule';

export function GroupsPage() {
  const { churchId, base, access } = useChurch();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [state, setState, reset] = useUrlState({
    q: '',
    type: '',
    view: 'all',
    inactive: false as boolean,
  });
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    ...groupsQuery(churchId, {
      q: state.q || undefined,
      type: (state.type || undefined) as GroupType | undefined,
      mine: state.view === 'mine',
      includeInactive: state.inactive,
    }),
    placeholderData: keepPreviousData,
  });
  const me = useQuery(directoryMeQuery(churchId));
  const canCreate = can.createGroup(access);
  const filtered = !!state.q || !!state.type || state.inactive;
  const pending = me.data?.pendingJoinRequests ?? 0;

  return (
    <Page size="wide">
      <PageHeader
        icon={UsersRound}
        tone="violet"
        title={t('groups.title')}
        description={t('groups.description')}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> <span className="sm:hidden">{t('common.add')}</span>
              <span className="hidden sm:inline">{t('groups.new')}</span>
            </Button>
          ) : null
        }
      />

      {pending > 0 ? (
        <Link
          to={`${base}/groups/requests`}
          data-tone="violet"
          className="pressable flex items-center gap-3 rounded-xl border border-tone/25 bg-tone-soft/60 px-4 py-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <Inbox className="size-5 shrink-0 text-tone-ink" aria-hidden />
          <span className="min-w-0 flex-1 font-medium text-tone-ink">
            {t('groups.pendingBanner', { count: pending })}
          </span>
          <ArrowRight className="size-4 text-tone-ink" aria-hidden />
        </Link>
      ) : null}

      <Segmented
        aria-label={t('groups.view')}
        className="sm:max-w-sm"
        value={state.view === 'mine' ? 'mine' : 'all'}
        onChange={(value) => setState({ view: value })}
        options={[
          { value: 'all', label: t('groups.allGroups') },
          { value: 'mine', label: t('groups.myGroups') },
        ]}
      />
      <FilterBar
        search={{
          value: state.q,
          onChange: (value) => setState({ q: value }),
          placeholder: t('groups.search'),
        }}
        filters={[
          {
            id: 'type',
            label: t('groups.type'),
            value: state.type,
            onChange: (value) => setState({ type: value }),
            options: GROUP_TYPES.map((value) => ({
              value,
              label: localize(GROUP_TYPE_TEXT[value], locale),
            })),
          },
          {
            id: 'inactive',
            label: t('groups.status'),
            value: state.inactive ? 'yes' : '',
            onChange: (value) => setState({ inactive: value === 'yes' }),
            options: [{ value: 'yes', label: t('groups.includeInactive') }],
          },
        ]}
        onReset={() => reset(['view'])}
      />

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
        filtered ? (
          <EmptyState
            icon={SlidersHorizontal}
            tone="violet"
            title={t('groups.noMatches')}
            description={t('common.noResultsHint')}
            action={
              <Button variant="outline" onClick={() => reset(['view'])}>
                {t('common.clearAll')}
              </Button>
            }
          />
        ) : state.view === 'mine' ? (
          <EmptyState
            icon={UserCheck}
            tone="violet"
            title={t('groups.noMine')}
            description={t('groups.noMineHint')}
            action={
              <Button variant="outline" onClick={() => setState({ view: 'all' })}>
                {t('groups.browseAll')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={UsersRound}
            tone="violet"
            title={t('groups.empty')}
            description={t('groups.emptyHint')}
            action={
              canCreate ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> {t('groups.createFirst')}
                </Button>
              ) : null
            }
          />
        )
      ) : (
        <ul
          className={cn(
            'grid gap-3 transition-opacity duration-200 sm:grid-cols-2 lg:grid-cols-3',
            query.isPlaceholderData && 'opacity-60',
          )}
        >
          {query.data.items.map((group) => (
            <li key={group.id}>
              <GroupCard group={group} />
            </li>
          ))}
        </ul>
      )}

      {canCreate ? (
        <GroupFormDialog
          open={creating}
          onOpenChange={setCreating}
          onSaved={(group) => navigate(`${base}/groups/${group.id}`)}
        />
      ) : null}
    </Page>
  );
}

function GroupCard({ group }: { group: GroupDetails }) {
  const { base } = useChurch();
  const { t, locale } = useI18n();
  const schedule = scheduleText(group, locale);
  const fill = group.capacity ? Math.min(1, group.memberCount / group.capacity) : null;
  const tone = GROUP_TYPE_STYLE[group.type].tone;
  return (
    <Link
      to={`${base}/groups/${group.id}`}
      className={cn(
        'pressable group relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-soft outline-none hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40',
        !group.isActive && 'opacity-70',
      )}
    >
      <span
        aria-hidden
        data-tone={group.coverColor ? undefined : tone}
        className={cn('absolute inset-x-0 top-0 h-1', !group.coverColor && 'bg-tone')}
        style={group.coverColor ? { backgroundColor: group.coverColor } : undefined}
      />
      <div className="flex items-start gap-3">
        <GroupCover type={group.type} color={group.coverColor} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold">
            <span className="truncate">{group.name}</span>
            {group.visibility === 'private' ? (
              <Lock
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-label={t('groups.private')}
              />
            ) : null}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {localize(GROUP_TYPE_TEXT[group.type], locale)}
          </p>
        </div>
        {group.pendingRequestCount > 0 ? (
          <StatusBadge size="sm" tone="violet" icon={Inbox}>
            {group.pendingRequestCount}
          </StatusBadge>
        ) : null}
      </div>
      {schedule || group.location ? (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          {schedule ? (
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{schedule}</span>
            </span>
          ) : null}
          {group.location ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{group.location}</span>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-auto flex items-end justify-between gap-3 pt-1">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {group.capacity
              ? t('groups.membersOfCapacity', {
                  count: group.memberCount,
                  capacity: group.capacity,
                })
              : t('groups.memberCount', { count: group.memberCount })}
          </p>
          {fill !== null ? (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                data-tone={fill >= 1 ? 'danger' : tone}
                className="h-full rounded-full bg-tone transition-[width] duration-300"
                style={{ width: `${Math.max(4, fill * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {group.myState === 'leader' ? (
            <StatusBadge size="sm" tone="amber" icon={Crown}>
              {t('groups.youLead')}
            </StatusBadge>
          ) : group.myState === 'member' ? (
            <StatusBadge size="sm" tone="success" icon={UserCheck}>
              {t('groups.youAreMember')}
            </StatusBadge>
          ) : group.myState === 'pending' ? (
            <StatusBadge size="sm" tone="warning" icon={Hourglass}>
              {t('groups.requested')}
            </StatusBadge>
          ) : null}
          {group.leaders.length > 0 ? (
            <AvatarGroup
              people={group.leaders.map((leader) => ({
                id: leader.userId,
                name: leader.name,
                src: leader.avatarUrl,
              }))}
              max={3}
            />
          ) : null}
        </div>
      </div>
    </Link>
  );
}
