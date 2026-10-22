import { can, type ChurchRole, type CustomRole } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Copy, KeyRound, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DataList } from '@/components/ui/data-list';
import { FilterBar } from '@/components/ui/filter-bar';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SkeletonCards, SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { ROLE_KEYS } from '@/lib/i18n/labels';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { rolesQuery, useDeleteRole } from '../api';
import { ROLE_TONES } from '../components/tones';
import { PermissionSummary } from '../components/permission-list';
import { SettingsPage } from './layout';

const BASE_ROLE_HINTS: Record<ChurchRole, MessageKey> = {
  owner: 'admin-security.baseOwnerHint',
  administrator: 'admin-security.baseAdministratorHint',
  member: 'admin-security.baseMemberHint',
};

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

export function RolesSettingsPage() {
  const { t } = useI18n();
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const query = useQuery(rolesQuery(churchId));
  const [state, setState, reset] = useUrlState({ q: '', base: '' });
  const [deleting, setDeleting] = useState<CustomRole | null>(null);
  const remove = useMutationToast(useDeleteRole(churchId), {
    success: () => t('admin-security.roleDeleted', { name: deleting?.name ?? '' }),
  });
  const manage = can.manageRoles(access);

  const items = (query.data?.items ?? []).filter(
    (role) =>
      !state.q || normalize(`${role.name} ${role.description ?? ''}`).includes(normalize(state.q)),
  );
  const previewRole = query.data?.baseRoles.find((role) => role.role === state.base);

  return (
    <SettingsPage
      section="roles"
      description={t('admin-security.rolesDescription')}
      actions={
        manage ? (
          <Button asChild size="sm">
            <Link to={`${base}/settings/roles/new`}>
              <Plus />
              {t('admin-security.newRole')}
            </Link>
          </Button>
        ) : null
      }
    >
      <Section
        title={t('admin-security.baseRoles')}
        description={t('admin-security.baseRolesHint')}
      >
        {query.isPending ? (
          <SkeletonCards count={3} />
        ) : query.data ? (
          <ul className="grid gap-2.5 sm:grid-cols-3">
            {query.data.baseRoles.map((role) => (
              <li key={role.role}>
                <button
                  type="button"
                  onClick={() => setState({ base: role.role }, { push: true })}
                  className="pressable group flex h-full w-full flex-col gap-2 rounded-xl border border-border/70 bg-card p-4 text-left shadow-soft outline-none hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <span className="flex items-center justify-between gap-2">
                    <StatusBadge tone={ROLE_TONES[role.role]}>
                      {t(ROLE_KEYS[role.role])}
                    </StatusBadge>
                    <ChevronRight
                      className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                  <span className="text-sm text-pretty text-muted-foreground">
                    {t(BASE_ROLE_HINTS[role.role])}
                  </span>
                  <span className="mt-auto text-xs font-semibold text-muted-foreground tabular">
                    {t('admin-security.permissionCount', { count: role.permissions.length })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section
        title={t('admin-security.customRoles')}
        description={t('admin-security.customRolesListHint')}
      >
        <FilterBar
          search={{
            value: state.q,
            onChange: (value) => setState({ q: value }),
            placeholder: t('admin-security.searchRoles'),
          }}
          onReset={() => reset(['base'])}
        />
        {query.isPending ? (
          <SkeletonList rows={5} />
        ) : query.isError ? (
          <ErrorState
            error={query.error}
            message={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            tone="amber"
            title={state.q ? t('common.noResults') : t('admin-security.rolesEmpty')}
            description={state.q ? t('common.noResultsHint') : t('admin-security.rolesEmptyHint')}
            action={
              manage && !state.q ? (
                <Button asChild>
                  <Link to={`${base}/settings/roles/new`}>
                    <Plus />
                    {t('admin-security.newRole')}
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <DataList
            items={items}
            getKey={(role) => role.id}
            href={(role) => `${base}/settings/roles/${role.id}`}
            leading={() => <ToneIcon icon={KeyRound} tone="amber" />}
            title={(role) => role.name}
            subtitle={(role) =>
              [
                t('admin-security.permissionCount', { count: role.permissions.length }),
                t('admin-security.memberCount', { count: role.memberCount }),
              ].join(' · ')
            }
            trailing={(role) =>
              role.isTemplate ? (
                <StatusBadge
                  tone="amber"
                  size="sm"
                  icon={Sparkles}
                  className="hidden sm:inline-flex"
                >
                  {t('admin-security.suggested')}
                </StatusBadge>
              ) : null
            }
            actions={(role) => {
              const editable = can.editCustomRole(access, role.permissions);
              return [
                {
                  id: 'edit',
                  label: t('common.edit'),
                  icon: Pencil,
                  onSelect: () => navigate(`${base}/settings/roles/${role.id}`),
                  hidden: !editable,
                },
                {
                  id: 'duplicate',
                  label: t('admin-security.duplicateRole'),
                  icon: Copy,
                  onSelect: () => navigate(`${base}/settings/roles/new?from=${role.id}`),
                  hidden: !manage || !editable,
                },
                {
                  id: 'delete',
                  label: t('common.delete'),
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => setDeleting(role),
                  hidden: !editable,
                },
              ];
            }}
            actionsLabel={(role) => t('admin-security.actionsFor', { name: role.name })}
          />
        )}
      </Section>

      <Sheet
        open={!!previewRole}
        onOpenChange={(open) => {
          if (!open) setState({ base: '' });
        }}
      >
        <SheetContent>
          {previewRole ? (
            <>
              <SheetHeader>
                <SheetTitle>{t(ROLE_KEYS[previewRole.role])}</SheetTitle>
                <SheetDescription>{t(BASE_ROLE_HINTS[previewRole.role])}</SheetDescription>
              </SheetHeader>
              <SheetBody>
                <PermissionSummary permissions={previewRole.permissions} />
              </SheetBody>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('admin-security.deleteRoleTitle', { name: deleting?.name ?? '' })}
        description={
          deleting && deleting.memberCount > 0
            ? t('admin-security.deleteRoleInUse', { count: deleting.memberCount })
            : t('admin-security.deleteRoleBody')
        }
        confirmText={deleting && deleting.memberCount > 0 ? deleting.name : undefined}
        confirmLabel={t('admin-security.deleteRole')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (deleting && (await remove.run(deleting.id)) !== undefined) setDeleting(null);
        }}
      />
    </SettingsPage>
  );
}
