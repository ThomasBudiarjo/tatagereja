import { useQuery } from '@tanstack/react-query';
import { FileDown, Trash2, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, PasswordInput } from '@/components/ui/input';
import { Alert, ErrorState } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { ToneIcon } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { deletionBlockersQuery, useDeleteAccount, useExportPersonalData } from '../api';
import { PasswordConfirmDialog } from '../components/password-confirm-dialog';
import { secondFactorBody, useSecondFactorForm } from './second-factor';
import { SecondFactorActions, SecondFactorFields } from './second-factor-form';

function DeleteAccountDialog({
  open,
  onOpenChange,
  twoFactorEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  twoFactorEnabled: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const form = useSecondFactorForm();
  const remove = useDeleteAccount();
  const [typed, setTyped] = useState('');
  const word = t('profile.deleteWord');
  const matches = typed.trim().toLocaleUpperCase() === word.toLocaleUpperCase();

  const close = (next: boolean) => {
    if (remove.isPending) return;
    if (!next) {
      form.reset();
      setTyped('');
    }
    onOpenChange(next);
  };
  const submit = async () => {
    if (remove.isPending || !matches) return;
    const values = form.getValues();
    if (!values.password) {
      form.setError('password', { message: t('profile.passwordRequired') }, { shouldFocus: true });
      return;
    }
    try {
      await remove.mutateAsync(
        twoFactorEnabled ? secondFactorBody(values) : { password: values.password },
      );
      toast.success(t('profile.accountDeleted'));
      navigate('/welcome', { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['password', 'code', 'recoveryCode'])) {
        toast.error(getErrorMessage(error));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('profile.deleteAccountTitle')}</DialogTitle>
          <DialogDescription>
            {t('profile.deleteAccountBody', { email: user?.email ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex min-h-0 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (twoFactorEnabled) void form.handleSubmit(() => submit())(event);
            else void submit();
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            <Alert variant="error">{t('profile.deleteAccountWarning')}</Alert>
            {twoFactorEnabled ? (
              <SecondFactorFields form={form} idPrefix="delete-account" />
            ) : (
              <Field
                label={t('profile.currentPassword')}
                htmlFor="delete-account-password"
                error={form.formState.errors.password?.message}
                required
              >
                <PasswordInput
                  id="delete-account-password"
                  autoComplete="current-password"
                  autoFocus
                  aria-invalid={!!form.formState.errors.password}
                  {...form.register('password')}
                />
              </Field>
            )}
            <Field label={t('profile.deleteTypeWord', { word })} htmlFor="delete-account-word">
              <Input
                id="delete-account-word"
                value={typed}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(event) => setTyped(event.target.value)}
              />
            </Field>
          </DialogBody>
          <SecondFactorActions
            onCancel={() => close(false)}
            pending={remove.isPending}
            variant="destructive"
            submitLabel={t('profile.deleteAccountAction')}
            disabled={!matches}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Data rights: a copy of everything the server keeps about the person, and leaving for good. */
export function PrivacySection() {
  const { t } = useI18n();
  const blockers = useQuery(deletionBlockersQuery());
  const exportData = useExportPersonalData();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <ToneIcon icon={FileDown} tone="sky" />
          <div className="min-w-0 flex-1">
            <CardTitle>{t('profile.exportTitle')}</CardTitle>
            <CardDescription className="mt-1">{t('profile.exportBody')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setExporting(true)}>
            <FileDown />
            {t('profile.exportAction')}
          </Button>
        </CardContent>
        <PasswordConfirmDialog
          open={exporting}
          onOpenChange={setExporting}
          title={t('profile.exportConfirmTitle')}
          description={t('profile.exportConfirmBody')}
          confirmLabel={t('profile.exportAction')}
          mutation={exportData}
          success={t('profile.exportDone')}
        />
      </Card>

      <Card className="border-destructive/30">
        <CardHeader className="flex-row items-start gap-3">
          <ToneIcon icon={UserX} tone="danger" />
          <div className="min-w-0 flex-1">
            <CardTitle className="text-destructive">{t('profile.deleteAccountTitle')}</CardTitle>
            <CardDescription className="mt-1">{t('profile.deleteAccountIntro')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {blockers.isPending ? (
            <Skeleton className="h-11 w-48" />
          ) : blockers.isError ? (
            <ErrorState
              compact
              message={getErrorMessage(blockers.error)}
              onRetry={() => void blockers.refetch()}
            />
          ) : blockers.data.ownedChurches.length > 0 ? (
            <Alert variant="warning" title={t('profile.deleteBlockedTitle')}>
              <p>{t('profile.deleteBlockedBody')}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {blockers.data.ownedChurches.map((church) => (
                  <li key={church.id}>
                    <Link
                      to={`/c/${church.id}/settings/danger`}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {church.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Alert>
          ) : (
            <>
              <Button
                variant="destructive"
                className="self-start"
                onClick={() => setDeleting(true)}
              >
                <Trash2 />
                {t('profile.deleteAccountAction')}
              </Button>
              <DeleteAccountDialog
                open={deleting}
                onOpenChange={setDeleting}
                twoFactorEnabled={blockers.data.twoFactorEnabled}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
