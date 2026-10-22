import {
  CHURCH_ROLES,
  MEMBER_SORTS,
  MEMBERSHIP_STATUSES,
  can,
  canViewSecurity,
  type MemberListItem,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { KeyRound, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DataList } from '@/components/ui/data-list';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { ROLE_KEYS } from '@/lib/i18n/labels';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { memberListQuery, rolesQuery } from '../api';
import { MemberStatusBadge, RoleBadge, TwoFactorBadge } from '../components/badges';
import { SettingsPage } from './layout';
import { useMemberActions } from './member-actions';

const PAGE_SIZE = 50;

const SORT_KEYS: Record<(typeof MEMBER_SORTS)[number], MessageKey> = {
  name: 'admin-security.sortNameAsc',
  '-name': 'admin-security.sortNameDesc',
  '-joinedAt': 'admin-security.sortNewest',
  joinedAt: 'admin-security.sortOldest',
  role: 'admin-security.sortRole',
};

function SummaryChip({
  label,
  value,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  tone?: 'warning';
  onClick: () => void;
}) {
  const { formatNumber } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-tone={tone}
      className={cn(
        'pressable flex min-h-16 flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        active ? 'border-primary/40 bg-accent' : 'border-border/70 bg-card hover:border-border',
      )}
    >
      <span
        className={cn(
          'text-xl leading-tight font-bold tracking-tight tabular',
          tone && value > 0 && 'text-tone-ink',
        )}
      >
        {formatNumber(value)}
      </span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </button>
  );
}

export function MembersSettingsPage() {
  const { t, formatDate } = useI18n();
  const { churchId, base, access } = useChurch();
  const showSecurity = canViewSecurity(access);
  const [state, setState, reset] = useUrlState({
    q: '',
    role: '',
    roleId: '',
    status: '',
    twoFactor: '',
    sort: 'name',
    page: 1,
  });
  const params = {
    q: state.q || undefined,
    role: (state.role || undefined) as MemberListItem['role'] | undefined,
    roleId: state.roleId || undefined,
    status: (state.status || undefined) as MemberListItem['status'] | undefined,
    twoFactor: showSecurity && state.twoFactor ? (state.twoFactor as 'on' | 'off') : undefined,
    sort: (MEMBER_SORTS as readonly string[]).includes(state.sort)
      ? (state.sort as (typeof MEMBER_SORTS)[number])
      : 'name',
    page: state.page,
    limit: PAGE_SIZE,
  };
  const query = useQuery({
    ...memberListQuery(churchId, params),
    placeholderData: keepPreviousData,
  });
  const roles = useQuery(rolesQuery(churchId));
  const { actionsFor, dialog } = useMemberActions();
  const roleNames = new Map((roles.data?.items ?? []).map((role) => [role.id, role.name]));
  const filtering =
    !!state.q || !!state.role || !!state.roleId || !!state.status || !!state.twoFactor;

  const filters: FilterDefinition[] = [
    {
      id: 'role',
      label: t('admin-security.filterBaseRole'),
      value: state.role,
      onChange: (value) => setState({ role: value }),
      options: CHURCH_ROLES.map((role) => ({
        value: role,
        label: t(ROLE_KEYS[role]),
        count: query.data?.summary.byRole[role],
      })),
    },
    {
      id: 'roleId',
      label: t('admin-security.filterCustomRole'),
      value: state.roleId,
      onChange: (value) => setState({ roleId: value }),
      options: (roles.data?.items ?? []).map((role) => ({
        value: role.id,
        label: role.name,
        count: role.memberCount,
      })),
    },
    {
      id: 'status',
      label: t('admin-security.filterStatus'),
      value: state.status,
      onChange: (value) => setState({ status: value }),
      options: MEMBERSHIP_STATUSES.map((status) => ({
        value: status,
        label: t(status === 'active' ? 'common.statusActive' : 'common.statusSuspended'),
      })),
    },
    ...(showSecurity
      ? [
          {
            id: 'twoFactor',
            label: t('admin-security.filterTwoFactor'),
            value: state.twoFactor,
            onChange: (value: string) => setState({ twoFactor: value }),
            options: [
              { value: 'on', label: t('admin-security.twoFactorOn') },
              { value: 'off', label: t('admin-security.managersWithoutTwoFactor') },
            ],
          } satisfies FilterDefinition,
        ]
      : []),
  ];

  const summary = query.data?.summary;

  return (
    <SettingsPage
      section="members"
      description={t('admin-security.membersDescription')}
      actions={
        can.createInvitations(access) ? (
          <Button asChild size="sm">
            <Link to={`${base}/settings/invitations?new=1`}>
              <UserPlus />
              <span className="hidden sm:inline">{t('admin-security.inviteMembers')}</span>
              <span className="sm:hidden">{t('admin-security.invite')}</span>
            </Link>
          </Button>
        ) : null
      }
    >
      {summary ? (
        <div className="grid animate-rise-in grid-cols-2 gap-2.5 sm:grid-cols-4">
          <SummaryChip
            label={t('admin-security.summaryAll')}
            value={summary.total}
            active={!filtering}
            onClick={() => reset(['sort'])}
          />
          <SummaryChip
            label={t('admin-security.summaryAdmins')}
            value={summary.byRole.administrator + summary.byRole.owner}
            active={state.role === 'administrator'}
            onClick={() =>
              setState({ role: state.role === 'administrator' ? '' : 'administrator' })
            }
          />
          <SummaryChip
            label={t('admin-security.summarySuspended')}
            value={summary.suspended}
            active={state.status === 'suspended'}
            onClick={() => setState({ status: state.status === 'suspended' ? '' : 'suspended' })}
          />
          {summary.managersWithoutTwoFactor !== null ? (
            <SummaryChip
              label={t('admin-security.managersWithoutTwoFactor')}
              value={summary.managersWithoutTwoFactor}
              tone="warning"
              active={state.twoFactor === 'off'}
              onClick={() => setState({ twoFactor: state.twoFactor === 'off' ? '' : 'off' })}
            />
          ) : (
            <SummaryChip
              label={t('admin-security.summaryActive')}
              value={summary.active}
              active={state.status === 'active'}
              onClick={() => setState({ status: state.status === 'active' ? '' : 'active' })}
            />
          )}
        </div>
      ) : null}

      <FilterBar
        search={{
          value: state.q,
          onChange: (value) => setState({ q: value }),
          placeholder: t('admin-security.searchMembers'),
        }}
        filters={filters}
        sort={{
          value: params.sort,
          onChange: (value) => setState({ sort: value }),
          options: MEMBER_SORTS.map((value) => ({ value, label: t(SORT_KEYS[value]) })),
        }}
        onReset={() => reset(['sort'])}
      />

      {query.isPending ? (
        <SkeletonList rows={6} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          tone="sky"
          title={filtering ? t('common.noResults') : t('admin-security.membersEmpty')}
          description={filtering ? t('common.noResultsHint') : t('admin-security.membersEmptyHint')}
          action={
            filtering ? (
              <Button variant="outline" onClick={() => reset(['sort'])}>
                {t('common.clearAll')}
              </Button>
            ) : can.createInvitations(access) ? (
              <Button asChild>
                <Link to={`${base}/settings/invitations?new=1`}>
                  <UserPlus />
                  {t('admin-security.inviteMembers')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div
          className={cn(
            'flex flex-col gap-3 transition-opacity duration-200',
            query.isPlaceholderData && 'opacity-60',
          )}
        >
          <DataList
            items={query.data.items}
            getKey={(member) => member.id}
            href={(member) => `${base}/settings/members/${member.id}`}
            leading={(member) => (
              <EntityAvatar name={member.user.name} src={member.user.avatarUrl} />
            )}
            title={(member) => (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{member.user.name}</span>
                {member.userId === access.userId ? (
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    {t('admin-security.you')}
                  </span>
                ) : null}
              </span>
            )}
            subtitle={(member) => (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{member.user.email}</span>
                {member.roleIds.length > 0 ? (
                  <span className="hidden shrink-0 items-center gap-1 sm:inline-flex">
                    ·
                    <KeyRound className="size-3" aria-hidden />
                    {member.roleIds
                      .map((id) => roleNames.get(id))
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(', ')}
                    {member.roleIds.length > 2 ? ` +${member.roleIds.length - 2}` : ''}
                  </span>
                ) : (
                  <span className="hidden shrink-0 sm:inline">
                    ·{' '}
                    {t('admin-security.joinedOn', {
                      date: formatDate(member.joinedAt, 'dateShort'),
                    })}
                  </span>
                )}
              </span>
            )}
            trailing={(member) => (
              <span className="flex items-center gap-1.5">
                {member.status === 'suspended' ? (
                  <MemberStatusBadge status="suspended" size="sm" />
                ) : null}
                {member.manager && member.twoFactorEnabled === false ? (
                  <span className="hidden md:inline-flex">
                    <TwoFactorBadge enabled={false} />
                  </span>
                ) : null}
                {member.isLeader ? (
                  <StatusBadge tone="teal" size="sm" className="hidden md:inline-flex">
                    {t('admin-security.leader')}
                  </StatusBadge>
                ) : null}
                {/* "Member" is the default; phones only show the roles that stand out. */}
                <span
                  className={member.role === 'member' ? 'hidden sm:inline-flex' : 'inline-flex'}
                >
                  <RoleBadge role={member.role} size="sm" />
                </span>
              </span>
            )}
            actions={(member) => actionsFor(member, { includeOpen: false })}
            actionsLabel={(member) => t('admin-security.actionsFor', { name: member.user.name })}
          />
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => {
              setState({ page });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      )}
      {dialog}
    </SettingsPage>
  );
}
