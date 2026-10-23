import { can } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Crown, DoorOpen, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { ToneIcon } from '@/components/ui/status-badge';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { toast } from 'sonner';
import { useUiStore } from '@/stores/ui';
import { memberListQuery, useDeleteChurch, useLeaveChurch, useTransferOwnership } from '../api';
import { SettingsPage } from './layout';

/** Password field inside a confirmation, with its server error. */
function PasswordStep({
  value,
  onChange,
  error,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  id: string;
}) {
  const { t } = useI18n();
  return (
    <Field label={t('admin-security.yourPassword')} htmlFor={id} error={error} required>
      <PasswordInput
        id={id}
        autoComplete="current-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error}
      />
    </Field>
  );
}

/** The password problem of a failed confirmation, if that is what failed. */
function passwordError(error: unknown, incorrect: string): string | undefined {
  if (isApiClientError(error) && error.status === 401) return incorrect;
  let message: string | undefined;
  applyServerErrors(error, (_field, value) => (message = value.message), ['password']);
  return message;
}

function TransferOwnershipCard() {
  const { t } = useI18n();
  const { church, churchId, access } = useChurch();
  const members = useQuery(memberListQuery(churchId, { status: 'active', limit: 200 }));
  const transfer = useTransferOwnership(churchId);
  const [target, setTarget] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const candidates = (members.data?.items ?? []).filter((item) => item.userId !== access.userId);
  const chosen = candidates.find((item) => item.userId === target);

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <ToneIcon icon={Crown} tone="brand" />
        <div className="min-w-0 flex-1">
          <CardTitle>{t('admin-security.transferTitle')}</CardTitle>
          <CardDescription className="mt-1">{t('admin-security.transferBody')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Combobox
          options={candidates.map((item) => ({
            value: item.userId,
            label: item.user.name,
            description: item.user.email,
            leading: <EntityAvatar name={item.user.name} src={item.user.avatarUrl} size="xs" />,
            keywords: [item.user.email],
          }))}
          value={target}
          onChange={setTarget}
          loading={members.isPending}
          placeholder={t('admin-security.transferPick')}
          className="flex-1"
        />
        <Button variant="outline" disabled={!chosen} onClick={() => setOpen(true)}>
          {t('admin-security.transferContinue')}
        </Button>
      </CardContent>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setPassword('');
            setError(undefined);
          }
        }}
        title={t('admin-security.transferConfirmTitle', { name: chosen?.user.name ?? '' })}
        description={t('admin-security.transferConfirmBody', { name: chosen?.user.name ?? '' })}
        confirmText={church.name}
        confirmLabel={t('admin-security.transferConfirm')}
        loading={transfer.isPending}
        onConfirm={async () => {
          if (!chosen || transfer.isPending) return;
          if (!password) {
            setError(t('admin-security.passwordRequired'));
            return;
          }
          try {
            await transfer.mutateAsync({
              userId: chosen.userId,
              password,
              confirmName: church.name,
            });
            toast.success(t('admin-security.transferDone', { name: chosen.user.name }));
            setOpen(false);
            setPassword('');
            setTarget(null);
          } catch (caught) {
            const field = passwordError(caught, t('admin-security.passwordIncorrect'));
            if (field) setError(field);
            else toast.error(getErrorMessage(caught));
          }
        }}
      >
        <PasswordStep
          id="transfer-password"
          value={password}
          onChange={setPassword}
          error={error}
        />
      </ConfirmDialog>
    </Card>
  );
}

export function DangerZonePage() {
  const { t } = useI18n();
  const { church, churchId, access } = useChurch();
  const navigate = useNavigate();
  const setLastChurchId = useUiStore((state) => state.setLastChurchId);
  const leave = useLeaveChurch(churchId);
  const remove = useDeleteChurch(churchId);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();

  return (
    <SettingsPage section="danger" description={t('admin-security.dangerDescription')}>
      {can.leaveChurch(access) ? (
        <Card>
          <CardHeader className="flex-row items-start gap-3">
            <ToneIcon icon={DoorOpen} tone="warning" />
            <div className="min-w-0 flex-1">
              <CardTitle>{t('admin-security.leaveTitle', { church: church.name })}</CardTitle>
              <CardDescription className="mt-1">{t('admin-security.leaveBody')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setLeaving(true)}>
              <DoorOpen />
              {t('admin-security.leaveAction')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Alert variant="info" title={t('admin-security.ownerCannotLeaveTitle')}>
          {t('admin-security.ownerCannotLeaveBody')}
        </Alert>
      )}

      {can.transferOwnership(access) ? <TransferOwnershipCard /> : null}

      {can.deleteChurch(access) ? (
        <Card className="border-destructive/40">
          <CardHeader className="flex-row items-start gap-3">
            <ToneIcon icon={Trash2} tone="danger" />
            <div className="min-w-0 flex-1">
              <CardTitle className="text-destructive">
                {t('admin-security.deleteChurchTitle')}
              </CardTitle>
              <CardDescription className="mt-1">
                {t('admin-security.deleteChurchBody')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2 />
              {t('admin-security.deleteChurchAction')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={t('admin-security.leaveConfirmTitle', { church: church.name })}
        description={t('admin-security.leaveConfirmBody')}
        confirmLabel={t('admin-security.leaveAction')}
        loading={leave.isPending}
        onConfirm={async () => {
          if (leave.isPending) return;
          try {
            await leave.mutateAsync();
            setLastChurchId(null);
            toast.success(t('admin-security.leftChurch', { church: church.name }));
            navigate('/churches', { replace: true });
          } catch (caught) {
            toast.error(getErrorMessage(caught));
          }
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={(next) => {
          setDeleting(next);
          if (!next) {
            setPassword('');
            setError(undefined);
          }
        }}
        title={t('admin-security.deleteChurchConfirmTitle', { church: church.name })}
        description={t('admin-security.deleteChurchConfirmBody')}
        confirmText={church.name}
        confirmLabel={t('admin-security.deleteChurchForever')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (remove.isPending) return;
          if (!password) {
            setError(t('admin-security.passwordRequired'));
            return;
          }
          try {
            await remove.mutateAsync(password);
            setLastChurchId(null);
            toast.success(t('admin-security.churchDeleted', { church: church.name }));
            navigate('/churches', { replace: true });
          } catch (caught) {
            setError(
              passwordError(caught, t('admin-security.passwordIncorrect')) ??
                getErrorMessage(caught),
            );
          }
        }}
      >
        <PasswordStep id="delete-password" value={password} onChange={setPassword} error={error} />
      </ConfirmDialog>
    </SettingsPage>
  );
}
