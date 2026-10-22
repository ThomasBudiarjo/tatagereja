import { can, type CustomRole, type MemberDetail } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, KeyRound, Lock, Pencil, UserRound, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ListGroup, ListRow } from '@/components/ui/list';
import { Alert, EmptyState, ErrorState } from '@/components/ui/misc';
import { RowActions } from '@/components/ui/row-actions';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton, SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ROLE_KEYS } from '@/lib/i18n/labels';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { memberDetailQuery, rolesQuery, useSetMemberRoles } from '../api';
import { MemberStatusBadge, RoleBadge, TwoFactorBadge } from '../components/badges';
import { PermissionSummary } from '../components/permission-list';
import { SettingsPage } from './layout';
import { useMemberActions } from './member-actions';

function AssignRolesSheet({
  open,
  onOpenChange,
  detail,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: MemberDetail;
  roles: CustomRole[];
}) {
  const { t, formatList } = useI18n();
  const { churchId, access } = useChurch();
  const current = detail.membership.roleIds;
  const [selected, setSelected] = useState<string[]>(current);
  const save = useMutationToast(useSetMemberRoles(churchId), {
    success: t('admin-security.rolesSaved', { name: detail.membership.user.name }),
  });
  const target = { role: detail.membership.role, userId: detail.membership.userId };
  const changed =
    selected.length !== current.length || selected.some((id) => !current.includes(id));
  const added = selected.filter((id) => !current.includes(id));
  const removed = current.filter((id) => !selected.includes(id));
  const nameOf = (id: string) => roles.find((role) => role.id === id)?.name ?? '';

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setSelected(current);
        onOpenChange(next);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('admin-security.assignRolesTitle')}</SheetTitle>
          <SheetDescription>
            {t('admin-security.assignRolesBody', { name: detail.membership.user.name })}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {roles.length === 0 ? (
            <EmptyState
              compact
              icon={KeyRound}
              tone="amber"
              title={t('admin-security.rolesEmpty')}
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {roles.map((role) => {
                const allowed = can.assignCustomRole(access, target, role.permissions);
                const checked = selected.includes(role.id);
                const id = `assign-${role.id}`;
                return (
                  <li key={role.id}>
                    <label
                      htmlFor={id}
                      className={`flex min-h-14 items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                        checked ? 'border-primary/40 bg-accent/60' : 'border-border/70 bg-card'
                      } ${allowed ? 'cursor-pointer hover:border-border' : 'opacity-60'}`}
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        disabled={!allowed}
                        className="mt-0.5"
                        onCheckedChange={(value) =>
                          setSelected((list) =>
                            value ? [...list, role.id] : list.filter((item) => item !== role.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-medium">
                          {role.name}
                          {!allowed ? (
                            <Lock className="size-3.5 text-muted-foreground" aria-hidden />
                          ) : null}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {allowed
                            ? t('admin-security.permissionCount', {
                                count: role.permissions.length,
                              })
                            : t('admin-security.roleNotGrantable')}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </SheetBody>
        {changed ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {[
              added.length > 0
                ? t('admin-security.rolesAdded', { roles: formatList(added.map(nameOf)) })
                : null,
              removed.length > 0
                ? t('admin-security.rolesRemoved', { roles: formatList(removed.map(nameOf)) })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!changed}
            loading={save.isPending}
            onClick={async () => {
              const done = await save.run({
                membershipId: detail.membership.id,
                roleIds: selected,
              });
              if (done) onOpenChange(false);
            }}
          >
            <Check />
            {t('common.saveChanges')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function MemberDetailPage() {
  const { t, formatDate, formatRelative } = useI18n();
  const { membershipId = '' } = useParams<{ membershipId: string }>();
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const query = useQuery(memberDetailQuery(churchId, membershipId));
  const roles = useQuery(rolesQuery(churchId));
  const [assigning, setAssigning] = useState(false);
  const { actionsFor, dialog } = useMemberActions({
    onRemoved: () => navigate(`${base}/settings/members`, { replace: true }),
  });

  if (query.isPending) {
    return (
      <SettingsPage
        section="members"
        breadcrumbs={[{ label: t('common.loading') }]}
        title={t('common.loading')}
      >
        <Skeleton className="h-28 rounded-2xl" />
        <SkeletonList rows={3} avatar={false} />
      </SettingsPage>
    );
  }
  if (query.isError) {
    return (
      <SettingsPage section="members" breadcrumbs={[{ label: t('common.errorTitle') }]}>
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </SettingsPage>
    );
  }

  const detail = query.data;
  const { membership } = detail;
  const roleList = roles.data?.items ?? [];
  const isSelf = membership.userId === access.userId;
  const canAssign = can.manageRoles(access) && membership.role !== 'owner';
  const rolesById = new Map(roleList.map((role) => [role.id, role]));
  const baseLabel = t('admin-security.fromBaseRole', { role: t(ROLE_KEYS[membership.role]) });
  const sources = (permission: (typeof detail.permissions.permissions)[number]) => [
    ...(detail.permissions.basePermissions.includes(permission) ? [baseLabel] : []),
    ...membership.roleIds
      .map((id) => rolesById.get(id))
      .filter((role): role is CustomRole => !!role && role.permissions.includes(permission))
      .map((role) => role.name),
  ];
  const actions = actionsFor(
    { ...membership, permissions: detail.permissions.permissions },
    { includeOpen: false },
  );

  return (
    <SettingsPage
      section="members"
      title={membership.user.name}
      breadcrumbs={[{ label: membership.user.name }]}
      actions={
        <RowActions
          actions={actions}
          label={t('admin-security.actionsFor', { name: membership.user.name })}
          className="size-10"
        />
      }
    >
      <Card className="animate-rise-in">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <EntityAvatar name={membership.user.name} src={membership.user.avatarUrl} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">{membership.user.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <RoleBadge role={membership.role} />
              <MemberStatusBadge status={membership.status} />
              {membership.manager || isSelf ? (
                <TwoFactorBadge enabled={membership.twoFactorEnabled} size="md" />
              ) : null}
              {isSelf ? (
                <StatusBadge tone="info">{t('admin-security.thisIsYou')}</StatusBadge>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">{t('admin-security.joined')}</dt>
                <dd className="font-medium">{formatDate(membership.joinedAt, 'dateShort')}</dd>
              </div>
              {detail.lastActiveAt ? (
                <div className="flex gap-1.5">
                  <dt className="text-muted-foreground">{t('admin-security.lastActive')}</dt>
                  <dd className="font-medium">{formatRelative(detail.lastActiveAt)}</dd>
                </div>
              ) : null}
              {membership.suspendedAt ? (
                <div className="flex gap-1.5">
                  <dt className="text-muted-foreground">{t('admin-security.suspendedSince')}</dt>
                  <dd className="font-medium">{formatDate(membership.suspendedAt, 'dateShort')}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          {detail.person ? (
            <Button asChild variant="outline" size="sm" className="self-start sm:self-center">
              <Link to={`${base}/people/${detail.person.id}`}>
                <UserRound />
                {t('admin-security.openProfile')}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {membership.status === 'suspended' ? (
        <Alert variant="warning" title={t('admin-security.suspendedAlertTitle')}>
          {t('admin-security.suspendedAlertBody')}
        </Alert>
      ) : null}
      {membership.manager && membership.twoFactorEnabled === false ? (
        <Alert variant="warning" title={t('admin-security.noTwoFactorAlertTitle')}>
          {t('admin-security.noTwoFactorAlertBody')}
        </Alert>
      ) : null}

      <Section
        title={t('admin-security.customRoles')}
        description={
          membership.role === 'owner'
            ? t('admin-security.ownerRolesLocked')
            : t('admin-security.customRolesHint')
        }
        action={
          canAssign ? (
            <Button size="sm" variant="outline" onClick={() => setAssigning(true)}>
              <Pencil />
              {t('admin-security.changeRoles')}
            </Button>
          ) : null
        }
      >
        {detail.permissions.roles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
            {t('admin-security.noCustomRoles')}
          </div>
        ) : (
          <ListGroup>
            {detail.permissions.roles.map((role) => (
              <ListRow
                key={role.id}
                to={`${base}/settings/roles/${role.id}`}
                leading={
                  <span
                    data-tone="amber"
                    className="flex size-9 items-center justify-center rounded-lg bg-tone-soft text-tone-ink"
                  >
                    <KeyRound className="size-4" />
                  </span>
                }
                title={role.name}
                subtitle={t('admin-security.permissionCount', {
                  count: rolesById.get(role.id)?.permissions.length ?? 0,
                })}
              />
            ))}
          </ListGroup>
        )}
      </Section>

      {detail.leaderGroups.length > 0 ? (
        <Section title={t('admin-security.leadsGroups')}>
          <ListGroup>
            {detail.leaderGroups.map((group) => (
              <ListRow
                key={group.id}
                to={`${base}/groups/${group.id}`}
                leading={<Users className="size-5 text-muted-foreground" />}
                title={group.name}
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}

      <Section
        title={t('admin-security.effectivePermissions')}
        description={t('admin-security.effectivePermissionsHint', {
          count: detail.permissions.permissions.length,
        })}
      >
        <PermissionSummary permissions={detail.permissions.permissions} sources={sources} />
      </Section>

      {canAssign && roles.data ? (
        <AssignRolesSheet
          open={assigning}
          onOpenChange={setAssigning}
          detail={detail}
          roles={roleList}
        />
      ) : null}
      {dialog}
    </SettingsPage>
  );
}
