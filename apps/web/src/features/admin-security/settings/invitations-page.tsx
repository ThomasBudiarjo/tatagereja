import {
  can,
  createInvitationBodySchema,
  type CreateInvitationBody,
  type Invitation,
  type InvitationStatus,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Ban, Plus, QrCode, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { DataList } from '@/components/ui/data-list';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert, EmptyState, ErrorState, Segmented } from '@/components/ui/misc';
import { QrDisplay } from '@/components/ui/qr-code';
import { Select } from '@/components/ui/select';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import type { Tone } from '@/components/ui/tone';
import {
  invitationsQuery,
  useCreateInvitation,
  useRevokeInvitation,
} from '@/features/invitations/api';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { ROLE_KEYS } from '@/lib/i18n/labels';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { SettingsPage } from './layout';

type FormInput = z.input<typeof createInvitationBodySchema>;

const STATUS_LOOK: Record<InvitationStatus, { tone: Tone; key: MessageKey }> = {
  active: { tone: 'success', key: 'admin-security.inviteActive' },
  expired: { tone: 'neutral', key: 'admin-security.inviteExpired' },
  exhausted: { tone: 'warning', key: 'admin-security.inviteExhausted' },
  revoked: { tone: 'danger', key: 'admin-security.inviteRevoked' },
};

const toNumber = (value: unknown) =>
  value === '' || value === null || value === undefined ? null : Number(value);

function CreateInvitationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invitation: Invitation) => void;
}) {
  const { t } = useI18n();
  const { churchId, access } = useChurch();
  const form = useForm<FormInput, unknown, CreateInvitationBody>({
    resolver: zodResolver(createInvitationBodySchema),
    defaultValues: { role: 'member', label: '', expiresInDays: 7, maxUses: null },
  });
  const create = useMutationToast(useCreateInvitation(churchId), {
    success: t('admin-security.inviteCreated'),
    form,
  });
  const { errors } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    const result = await create.run(values);
    if (result) {
      form.reset();
      onCreated(result.invitation);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!create.isPending) onOpenChange(next);
        if (!next) form.reset();
      }}
    >
      <DialogContent>
        <form
          onSubmit={(event) => void submit(event)}
          noValidate
          className="flex min-h-0 flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{t('admin-security.newInvitation')}</DialogTitle>
            <DialogDescription>{t('admin-security.newInvitationBody')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label={t('admin-security.inviteRole')} htmlFor="invite-role">
              <Select id="invite-role" autoFocus {...form.register('role')}>
                <option value="member">{t(ROLE_KEYS.member)}</option>
                {can.inviteWithRole(access, 'administrator') ? (
                  <option value="administrator">{t(ROLE_KEYS.administrator)}</option>
                ) : null}
              </Select>
            </Field>
            <Field
              label={t('admin-security.inviteLabel')}
              htmlFor="invite-label"
              description={t('admin-security.inviteLabelHint')}
              error={errors.label?.message}
            >
              <Input
                id="invite-label"
                maxLength={200}
                aria-invalid={!!errors.label}
                {...form.register('label')}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t('admin-security.inviteExpires')}
                htmlFor="invite-expires"
                description={t('admin-security.inviteExpiresHint')}
                error={errors.expiresInDays?.message}
              >
                <Input
                  id="invite-expires"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  aria-invalid={!!errors.expiresInDays}
                  {...form.register('expiresInDays', { setValueAs: toNumber })}
                />
              </Field>
              <Field
                label={t('admin-security.inviteMaxUses')}
                htmlFor="invite-uses"
                description={t('admin-security.inviteMaxUsesHint')}
                error={errors.maxUses?.message}
              >
                <Input
                  id="invite-uses"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10000}
                  aria-invalid={!!errors.maxUses}
                  {...form.register('maxUses', { setValueAs: toNumber })}
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending}>
              <Plus />
              {t('admin-security.createInvitation')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InvitationsSettingsPage() {
  const { t, formatDate, formatDateTime } = useI18n();
  const { church, churchId } = useChurch();
  const invitations = useQuery(invitationsQuery(churchId));
  const [state, setState] = useUrlState({ new: false as boolean, show: '', status: 'active' });
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const revoke = useMutationToast(useRevokeInvitation(churchId), {
    success: t('admin-security.inviteRevokedToast'),
  });
  const items = (invitations.data?.items ?? []).filter((invitation) =>
    state.status === 'all'
      ? true
      : state.status === 'active'
        ? invitation.status === 'active'
        : invitation.status !== 'active',
  );
  const shown = invitations.data?.items.find((invitation) => invitation.id === state.show) ?? null;
  const titleOf = (invitation: Invitation) =>
    invitation.label ||
    t('admin-security.inviteDefaultLabel', { role: t(ROLE_KEYS[invitation.role]) });

  const share = async (invitation: Invitation) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('admin-security.shareTitle', { church: church.name }),
          url: invitation.url,
        });
      } catch {
        // Cancelled by the person.
      }
    }
  };

  return (
    <SettingsPage
      section="invitations"
      description={t('admin-security.invitationsDescription')}
      actions={
        <Button size="sm" onClick={() => setState({ new: true }, { push: true })}>
          <Plus />
          <span className="hidden sm:inline">{t('admin-security.newInvitation')}</span>
          <span className="sm:hidden">{t('common.add')}</span>
        </Button>
      }
    >
      <Segmented
        aria-label={t('admin-security.filterStatus')}
        value={state.status}
        onChange={(value) => setState({ status: value })}
        options={[
          { value: 'active', label: t('admin-security.inviteActive') },
          { value: 'inactive', label: t('admin-security.inviteInactive') },
          { value: 'all', label: t('common.all') },
        ]}
        className="sm:max-w-md"
      />

      {invitations.isPending ? (
        <SkeletonList rows={4} />
      ) : invitations.isError ? (
        <ErrorState
          error={invitations.error}
          message={getErrorMessage(invitations.error)}
          onRetry={() => void invitations.refetch()}
          retrying={invitations.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={QrCode}
          tone="teal"
          title={
            state.status === 'active' ? t('admin-security.invitesEmpty') : t('common.noResults')
          }
          description={t('admin-security.invitesEmptyHint')}
          action={
            <Button onClick={() => setState({ new: true }, { push: true })}>
              <Plus />
              {t('admin-security.newInvitation')}
            </Button>
          }
        />
      ) : (
        <DataList
          items={items}
          getKey={(invitation) => invitation.id}
          onRowClick={(invitation) => setState({ show: invitation.id }, { push: true })}
          leading={() => <ToneIcon icon={QrCode} tone="teal" />}
          title={titleOf}
          subtitle={(invitation) =>
            [
              invitation.maxUses
                ? t('admin-security.inviteUsesOf', {
                    used: invitation.useCount,
                    max: invitation.maxUses,
                  })
                : t('admin-security.inviteUses', { count: invitation.useCount }),
              invitation.expiresAt
                ? t('admin-security.inviteExpiresOn', {
                    date: formatDate(invitation.expiresAt, 'dateShort'),
                  })
                : t('admin-security.inviteNoExpiry'),
              t('admin-security.inviteBy', { name: invitation.createdByName }),
            ].join(' · ')
          }
          trailing={(invitation) =>
            // Active is the usual case; only ended invitations carry a badge.
            invitation.status !== 'active' ? (
              <StatusBadge tone={STATUS_LOOK[invitation.status].tone} dot size="sm">
                {t(STATUS_LOOK[invitation.status].key)}
              </StatusBadge>
            ) : null
          }
          actions={(invitation) => [
            {
              id: 'revoke',
              label: t('admin-security.revokeInvitation'),
              icon: Ban,
              destructive: true,
              onSelect: () => setRevoking(invitation),
              hidden: invitation.status !== 'active',
            },
          ]}
          actionsLabel={(invitation) =>
            t('admin-security.actionsFor', { name: titleOf(invitation) })
          }
        />
      )}

      <CreateInvitationDialog
        open={state.new}
        onOpenChange={(open) => setState({ new: open })}
        onCreated={(invitation) => setState({ new: false, show: invitation.id, status: 'active' })}
      />

      <Dialog open={!!shown} onOpenChange={(open) => !open && setState({ show: '' })}>
        <DialogContent>
          {shown ? (
            <>
              <DialogHeader>
                <DialogTitle>{titleOf(shown)}</DialogTitle>
                <DialogDescription>
                  {t('admin-security.inviteShowBody', { date: formatDateTime(shown.createdAt) })}
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="flex flex-col items-center gap-4">
                {shown.status !== 'active' ? (
                  <Alert variant="warning" className="w-full">
                    {t('admin-security.inviteNotActive', {
                      status: t(STATUS_LOOK[shown.status].key),
                    })}
                  </Alert>
                ) : null}
                <QrDisplay
                  value={shown.url}
                  size={208}
                  downloadName={`undangan-${church.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                />
                <p className="w-full truncate rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground select-all">
                  {shown.url}
                </p>
                <div className="grid w-full grid-cols-2 gap-2">
                  <CopyButton
                    value={shown.url}
                    size="default"
                    label={t('admin-security.copyLink')}
                  />
                  <Button
                    onClick={() => void share(shown)}
                    disabled={typeof navigator.share !== 'function'}
                  >
                    <Share2 />
                    {t('common.share')}
                  </Button>
                </div>
              </DialogBody>
              <DialogFooter>
                {shown.status === 'active' ? (
                  <Button variant="destructive" onClick={() => setRevoking(shown)}>
                    <Ban />
                    {t('admin-security.revokeInvitation')}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => setState({ show: '' })}>
                  {t('common.close')}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('admin-security.revokeTitle')}
        description={t('admin-security.revokeBody')}
        confirmLabel={t('admin-security.revokeInvitation')}
        loading={revoke.isPending}
        onConfirm={async () => {
          if (revoking && (await revoke.run(revoking.id)) !== undefined) setRevoking(null);
        }}
      />
    </SettingsPage>
  );
}
