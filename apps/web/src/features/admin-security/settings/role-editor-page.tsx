import {
  ROLE_TEMPLATES,
  can,
  customRoleInputSchema,
  grantablePermissionsFor,
  localize,
  normalizePermissions,
  permissionDiff,
  sensitivePermissions,
  templatePermissions,
  type CustomRole,
  type CustomRoleInput,
  type Locale,
  type Permission,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Eye, KeyRound, Lock, Plus, Save, Sparkles, Trash2, UserMinus, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/ui/list';
import { Alert, EmptyState, ErrorState, SearchInput } from '@/components/ui/misc';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton, SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import {
  memberListQuery,
  roleMembersQuery,
  rolesQuery,
  useDeleteRole,
  useSaveRole,
  useSetMemberRoles,
} from '../api';
import { MemberStatusBadge } from '../components/badges';
import { PermissionSummary } from '../components/permission-list';
import { PermissionMatrix } from '../components/permission-matrix';
import { SettingsPage } from './layout';

type FormInput = z.input<typeof customRoleInputSchema>;

/** What the role grants, in plain words, with a warning for sensitive data and the change. */
function RolePreview({
  permissions,
  before,
}: {
  permissions: readonly Permission[];
  before?: readonly Permission[];
}) {
  const { t } = useI18n();
  const sensitive = sensitivePermissions(permissions);
  const diff = before ? permissionDiff(before, permissions) : null;
  return (
    <div className="flex flex-col gap-3">
      {diff && (diff.added.length > 0 || diff.removed.length > 0) ? (
        <div className="flex flex-wrap gap-1.5" aria-live="polite">
          {diff.added.length > 0 ? (
            <StatusBadge tone="success">
              {t('admin-security.diffAdded', { count: diff.added.length })}
            </StatusBadge>
          ) : null}
          {diff.removed.length > 0 ? (
            <StatusBadge tone="danger">
              {t('admin-security.diffRemoved', { count: diff.removed.length })}
            </StatusBadge>
          ) : null}
        </div>
      ) : null}
      {sensitive.length > 0 ? (
        <Alert variant="warning" title={t('admin-security.sensitiveWarningTitle')}>
          {t('admin-security.sensitiveWarningBody', { count: sensitive.length })}
        </Alert>
      ) : null}
      <PermissionSummary
        permissions={permissions}
        collapsible
        empty={
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
            {t('admin-security.previewEmpty')}
          </p>
        }
      />
    </div>
  );
}

function RoleMembers({ role }: { role: CustomRole }) {
  const { t } = useI18n();
  const { churchId, base, access } = useChurch();
  const members = useQuery(roleMembersQuery(churchId, role.id));
  const everyone = useQuery(memberListQuery(churchId, { limit: 200 }));
  const setRoles = useMutationToast(useSetMemberRoles(churchId));
  const [adding, setAdding] = useState<string | null>(null);
  const assignable = can.assignCustomRole(access, { role: 'member', userId: '' }, role.permissions);
  const assignedIds = new Set(members.data?.items.map((item) => item.membershipId));
  const candidates = (everyone.data?.items ?? []).filter(
    (member) => !assignedIds.has(member.id) && member.role !== 'owner',
  );

  const change = async (membershipId: string, add: boolean) => {
    const member = everyone.data?.items.find((item) => item.id === membershipId);
    if (!member) return;
    const roleIds = add
      ? [...new Set([...member.roleIds, role.id])]
      : member.roleIds.filter((id) => id !== role.id);
    const done = await setRoles.run({ membershipId, roleIds });
    if (done) {
      setAdding(null);
      toast.success(
        t(add ? 'admin-security.roleAssigned' : 'admin-security.roleUnassigned', {
          name: member.user.name,
          role: role.name,
        }),
      );
    }
  };

  return (
    <Section
      title={t('admin-security.roleMembers')}
      description={t('admin-security.memberCount', {
        count: members.data?.items.length ?? role.memberCount,
      })}
    >
      {assignable && everyone.data ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Combobox
            options={candidates.map((member) => ({
              value: member.id,
              label: member.user.name,
              description: member.user.email,
              leading: (
                <EntityAvatar name={member.user.name} src={member.user.avatarUrl} size="xs" />
              ),
              keywords: [member.user.email],
            }))}
            value={adding}
            onChange={setAdding}
            placeholder={t('admin-security.addMemberToRole')}
            className="flex-1"
          />
          <Button
            variant="outline"
            disabled={!adding}
            loading={setRoles.isPending && !!adding}
            onClick={() => adding && void change(adding, true)}
          >
            <Plus />
            {t('common.add')}
          </Button>
        </div>
      ) : null}
      {members.isPending ? (
        <SkeletonList rows={2} />
      ) : members.isError ? (
        <ErrorState
          compact
          message={getErrorMessage(members.error)}
          onRetry={() => void members.refetch()}
        />
      ) : members.data.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          {t('admin-security.roleNoMembers')}
        </p>
      ) : (
        <ListGroup>
          {members.data.items.map((item) => (
            <ListRow
              key={item.membershipId}
              leading={<EntityAvatar name={item.user.name} src={item.user.avatarUrl} />}
              title={
                <Link
                  to={`${base}/settings/members/${item.membershipId}`}
                  className="rounded-sm underline-offset-4 hover:underline"
                >
                  {item.user.name}
                </Link>
              }
              subtitle={item.user.email}
              trailing={
                <span className="flex items-center gap-1.5">
                  {item.status === 'suspended' ? (
                    <MemberStatusBadge status="suspended" size="sm" />
                  ) : null}
                  {assignable ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-9"
                      aria-label={t('admin-security.unassignRole', { name: item.user.name })}
                      disabled={setRoles.isPending}
                      onClick={() => void change(item.membershipId, false)}
                    >
                      <UserMinus />
                    </Button>
                  ) : null}
                </span>
              }
            />
          ))}
        </ListGroup>
      )}
    </Section>
  );
}

export function RoleEditorPage() {
  const { t, locale } = useI18n();
  const { roleId } = useParams<{ roleId: string }>();
  const [params] = useSearchParams();
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const roles = useQuery(rolesQuery(churchId));

  if (roles.isPending) {
    return (
      <SettingsPage
        section="roles"
        breadcrumbs={[{ label: t('common.loading') }]}
        title={t('common.loading')}
      >
        <Skeleton className="h-40 rounded-xl" />
        <SkeletonList rows={6} avatar={false} />
      </SettingsPage>
    );
  }
  if (roles.isError) {
    return (
      <SettingsPage section="roles" breadcrumbs={[{ label: t('common.errorTitle') }]}>
        <ErrorState
          error={roles.error}
          message={getErrorMessage(roles.error)}
          onRetry={() => void roles.refetch()}
          retrying={roles.isFetching}
        />
      </SettingsPage>
    );
  }
  const role = roleId ? roles.data.items.find((item) => item.id === roleId) : undefined;
  if (roleId && !role) {
    return (
      <SettingsPage section="roles" breadcrumbs={[{ label: t('admin-security.roleNotFound') }]}>
        <EmptyState
          icon={KeyRound}
          tone="amber"
          title={t('admin-security.roleNotFound')}
          description={t('admin-security.roleNotFoundHint')}
          action={
            <Button asChild variant="outline">
              <Link to={`${base}/settings/roles`}>{t('admin-security.backToRoles')}</Link>
            </Button>
          }
        />
      </SettingsPage>
    );
  }
  const source = !role
    ? roles.data.items.find((item) => item.id === params.get('from'))
    : undefined;
  return (
    <RoleForm
      key={role?.id ?? `new-${source?.id ?? ''}`}
      role={role}
      source={source}
      allRoles={roles.data.items}
      onSaved={(saved) => navigate(`${base}/settings/roles/${saved.id}`, { replace: true })}
      onDeleted={() => navigate(`${base}/settings/roles`, { replace: true })}
      canManage={can.manageRoles(access)}
      locale={locale}
    />
  );
}

function RoleForm({
  role,
  source,
  allRoles,
  onSaved,
  onDeleted,
  canManage,
  locale,
}: {
  role?: CustomRole;
  source?: CustomRole;
  allRoles: CustomRole[];
  onSaved: (role: CustomRole) => void;
  onDeleted: () => void;
  canManage: boolean;
  locale: Locale;
}) {
  const { t } = useI18n();
  const { churchId, access } = useChurch();
  const grantable = useMemo(() => new Set(grantablePermissionsFor(access)), [access]);
  const editable = canManage && (!role || can.editCustomRole(access, role.permissions));
  const [search, setSearch] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<FormInput, unknown, CustomRoleInput>({
    resolver: zodResolver(customRoleInputSchema),
    defaultValues: {
      name: role?.name ?? (source ? t('admin-security.copyOf', { name: source.name }) : ''),
      description: role?.description ?? source?.description ?? '',
      permissions:
        role?.permissions ?? (source ? source.permissions.filter((p) => grantable.has(p)) : []),
    },
  });
  const save = useMutationToast(useSaveRole(churchId), {
    success: (data) => t('admin-security.roleSaved', { name: data.role.name }),
    form,
    fields: ['name', 'description', 'permissions'],
    error: (error) => {
      // A clash with another role's name belongs next to the name field.
      if (isApiClientError(error) && error.message === t('admin-security.errRoleNameTaken')) {
        form.setError('name', { type: 'server', message: error.message }, { shouldFocus: true });
      }
      return getErrorMessage(error);
    },
  });
  const remove = useMutationToast(useDeleteRole(churchId), {
    success: t('admin-security.roleDeleted', { name: role?.name ?? '' }),
  });
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(
    isDirty && !isSubmitting && !isSubmitSuccessful && !deleting,
  );
  const permissions = normalizePermissions(
    useWatch({ control: form.control, name: 'permissions' }) ?? [],
  );
  const name = useWatch({ control: form.control, name: 'name' });

  const submit = form.handleSubmit(async (values) => {
    const result = await save.run({ id: role?.id, body: values });
    if (result) {
      form.reset({
        name: result.role.name,
        description: result.role.description ?? '',
        permissions: result.role.permissions,
      });
      if (!role) onSaved(result.role);
    }
  });

  const fillFrom = (list: readonly Permission[]) =>
    form.setValue(
      'permissions',
      normalizePermissions([
        ...permissions,
        ...list.filter((permission) => grantable.has(permission)),
      ]),
      { shouldDirty: true },
    );

  const title = role ? role.name : t('admin-security.newRole');
  const preview = <RolePreview permissions={permissions} before={role?.permissions} />;

  return (
    <SettingsPage
      section="roles"
      title={title}
      breadcrumbs={[{ label: title }]}
      description={
        role?.isTemplate ? (
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-4 text-tone-ink" data-tone="amber" aria-hidden />
            {t('admin-security.templateRoleHint')}
          </span>
        ) : (
          t('admin-security.roleEditorHint')
        )
      }
    >
      {!editable ? (
        <Alert variant="info" title={t('admin-security.readOnlyRoleTitle')}>
          {canManage
            ? t('admin-security.readOnlyRoleEscalation')
            : t('admin-security.readOnlyRoleBody')}
        </Alert>
      ) : null}
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <Field
                label={t('admin-security.roleName')}
                htmlFor="role-name"
                error={errors.name?.message}
                required
              >
                <Input
                  id="role-name"
                  autoFocus={!role}
                  readOnly={!editable}
                  maxLength={60}
                  placeholder={t('admin-security.roleNamePlaceholder')}
                  aria-invalid={!!errors.name}
                  {...form.register('name')}
                />
              </Field>
              <Field
                label={t('admin-security.roleDescription')}
                htmlFor="role-description"
                error={errors.description?.message}
                description={t('admin-security.roleDescriptionHint')}
              >
                <Textarea
                  id="role-description"
                  readOnly={!editable}
                  maxLength={500}
                  className="min-h-20"
                  aria-invalid={!!errors.description}
                  {...form.register('description')}
                />
              </Field>
            </CardContent>
          </Card>

          <Section
            title={t('admin-security.permissions')}
            description={t('admin-security.permissionsSelected', { count: permissions.length })}
            action={
              editable ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <Wand2 />
                      <span className="hidden sm:inline">{t('admin-security.fillFrom')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                    <DropdownMenuLabel>{t('admin-security.fillFromTemplate')}</DropdownMenuLabel>
                    {ROLE_TEMPLATES.map((template) => (
                      <DropdownMenuItem
                        key={template.key}
                        onSelect={() => fillFrom(templatePermissions(template.key))}
                      >
                        <Sparkles />
                        {localize(template.name, locale)}
                      </DropdownMenuItem>
                    ))}
                    {allRoles.filter((item) => item.id !== role?.id).length > 0 ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>{t('admin-security.fillFromRole')}</DropdownMenuLabel>
                        {allRoles
                          .filter((item) => item.id !== role?.id)
                          .map((item) => (
                            <DropdownMenuItem
                              key={item.id}
                              onSelect={() => fillFrom(item.permissions)}
                            >
                              <KeyRound />
                              {item.name}
                            </DropdownMenuItem>
                          ))}
                      </>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      destructive
                      onSelect={() => form.setValue('permissions', [], { shouldDirty: true })}
                    >
                      <Trash2 />
                      {t('admin-security.clearPermissions')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null
            }
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t('admin-security.searchPermissions')}
                className="flex-1"
              />
              <label className="flex min-h-11 items-center gap-2.5 rounded-lg px-1 text-sm font-medium">
                <Switch checked={onlySelected} onCheckedChange={setOnlySelected} />
                {t('admin-security.onlySelected')}
              </label>
            </div>
            {errors.permissions?.message ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.permissions.message}
              </p>
            ) : null}
            <Controller
              control={form.control}
              name="permissions"
              render={({ field }) => (
                <PermissionMatrix
                  value={normalizePermissions(field.value ?? [])}
                  onChange={(next) => field.onChange(normalizePermissions(next))}
                  grantable={grantable}
                  readOnly={!editable}
                  search={search}
                  onlySelected={onlySelected}
                />
              )}
            />
          </Section>

          {role ? <RoleMembers role={role} /> : null}

          {role && editable ? (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle>{t('admin-security.deleteRole')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {role.memberCount > 0
                    ? t('admin-security.deleteRoleInUse', { count: role.memberCount })
                    : t('admin-security.deleteRoleBody')}
                </p>
                <Button type="button" variant="destructive" onClick={() => setDeleting(true)}>
                  <Trash2 />
                  {t('admin-security.deleteRole')}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-6 flex flex-col gap-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="size-4 text-muted-foreground" aria-hidden />
                  {t('admin-security.previewTitle')}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('admin-security.previewHint', { name: name || t('admin-security.thisRole') })}
                </p>
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-y-auto">{preview}</CardContent>
            </Card>
            {editable ? (
              <Button
                type="submit"
                size="lg"
                loading={save.isPending}
                disabled={!isDirty && !!role}
              >
                <Save />
                {role ? t('common.saveChanges') : t('admin-security.createRole')}
              </Button>
            ) : null}
          </div>
        </aside>

        {/* Phones and tablets: a sticky bar with the count, the preview and saving. */}
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 md:bottom-4 -mx-1 flex items-center gap-2 rounded-2xl border border-border/70 bg-card/95 p-2 shadow-raised backdrop-blur lg:hidden">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setPreviewOpen(true)}
            className="flex-1 justify-start"
          >
            <Eye />
            <span className="truncate">
              {t('admin-security.permissionsSelected', { count: permissions.length })}
            </span>
          </Button>
          {editable ? (
            <Button type="submit" loading={save.isPending} disabled={!isDirty && !!role}>
              <Save />
              {role ? t('common.save') : t('admin-security.createRole')}
            </Button>
          ) : null}
        </div>
        {guard}
      </form>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('admin-security.previewTitle')}</SheetTitle>
            <SheetDescription>
              {t('admin-security.previewHint', { name: name || t('admin-security.thisRole') })}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>{preview}</SheetBody>
        </SheetContent>
      </Sheet>

      {role ? (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={t('admin-security.deleteRoleTitle', { name: role.name })}
          description={
            role.memberCount > 0
              ? t('admin-security.deleteRoleInUse', { count: role.memberCount })
              : t('admin-security.deleteRoleBody')
          }
          confirmText={role.memberCount > 0 ? role.name : undefined}
          confirmLabel={t('admin-security.deleteRole')}
          loading={remove.isPending}
          onConfirm={async () => {
            if ((await remove.run(role.id)) !== undefined) {
              setDeleting(false);
              onDeleted();
            }
          }}
        />
      ) : null}
      {!editable && role ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden />
          {t('admin-security.readOnlyFooter')}
        </p>
      ) : null}
    </SettingsPage>
  );
}
