import type { PasswordResetLink } from '@tatagereja/shared';
import { KeyRound, Share2, ShieldCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyButton } from '@/components/ui/copy-button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert } from '@/components/ui/misc';
import { QrDisplay } from '@/components/ui/qr-code';
import { ToneIcon } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useCreatePasswordReset } from '../api';

/**
 * Making a one-time password reset link for a member (there is no email). The administrator
 * first confirms they checked who is asking; the link is then shown once, with a QR code to
 * scan on the member's phone, and forgotten when the dialog closes.
 */
export function PasswordResetDialog({
  member,
  onClose,
}: {
  member: { id: string; user: { name: string } };
  onClose: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  const { churchId } = useChurch();
  const confirmId = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [missing, setMissing] = useState(false);
  const [link, setLink] = useState<PasswordResetLink | null>(null);
  const create = useMutationToast(useCreatePasswordReset(churchId), {
    success: t('admin-security.resetCreated'),
  });
  const name = member.user.name;

  const submit = async () => {
    if (!confirmed) {
      setMissing(true);
      return;
    }
    const result = await create.run(member.id);
    if (result) setLink(result);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !create.isPending && onClose()}>
      <DialogContent>
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('admin-security.resetReadyTitle', { name })}</DialogTitle>
              <DialogDescription>
                {t('admin-security.resetReadyBody', {
                  name,
                  time: formatDateTime(link.expiresAt),
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col items-center gap-4">
              {link.twoFactorRequired ? (
                <Alert variant="info" className="w-full">
                  {t('admin-security.resetTwoFactor', { name })}
                </Alert>
              ) : null}
              <QrDisplay value={link.url} size={200} />
              <p className="w-full truncate rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground select-all">
                {link.url}
              </p>
              <div className="grid w-full grid-cols-2 gap-2">
                <CopyButton value={link.url} size="default" label={t('admin-security.copyLink')} />
                <Button
                  onClick={() => void navigator.share?.({ url: link.url }).catch(() => undefined)}
                  disabled={typeof navigator.share !== 'function'}
                >
                  <Share2 />
                  {t('common.share')}
                </Button>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                {t('common.close')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            className="flex min-h-0 flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogHeader className="flex-row items-start gap-3">
              <ToneIcon icon={KeyRound} tone="amber" />
              <div className="min-w-0 flex-1">
                <DialogTitle>{t('admin-security.resetTitle', { name })}</DialogTitle>
                <DialogDescription className="mt-1">
                  {t('admin-security.resetBody', { name })}
                </DialogDescription>
              </div>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-2">
              <label
                htmlFor={confirmId}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border/70 px-3.5 py-3 text-sm"
              >
                <Checkbox
                  id={confirmId}
                  autoFocus
                  checked={confirmed}
                  aria-invalid={missing && !confirmed}
                  aria-describedby={missing && !confirmed ? `${confirmId}-error` : undefined}
                  onCheckedChange={(value) => {
                    setConfirmed(value === true);
                    setMissing(false);
                  }}
                  className="mt-0.5"
                />
                <span className="font-medium">{t('admin-security.resetConfirm', { name })}</span>
              </label>
              {missing && !confirmed ? (
                <p id={`${confirmId}-error`} className="text-sm text-destructive" role="alert">
                  {t('admin-security.resetConfirmRequired')}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={create.isPending}>
                <ShieldCheck />
                {t('admin-security.resetCreate')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
