import { passwordConfirmBodySchema, type PasswordConfirmBody } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import type { UseMutationResult } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
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
import { PasswordInput } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { applyServerErrors } from '@/lib/forms';

/**
 * Asks for the account password again before a sensitive action (download data, backup).
 * A wrong password shows on the field; the dialog stays open until the action succeeds.
 */
export function PasswordConfirmDialog<TData>({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  mutation,
  success,
  variant = 'default',
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  mutation: UseMutationResult<TData, unknown, string, unknown>;
  success?: string;
  variant?: ButtonProps['variant'];
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const form = useForm<PasswordConfirmBody>({
    resolver: zodResolver(passwordConfirmBodySchema),
    defaultValues: { password: '' },
  });
  const pending = mutation.isPending;
  const close = (next: boolean) => {
    if (pending) return;
    if (!next) form.reset();
    onOpenChange(next);
  };
  const submit = form.handleSubmit(async (values) => {
    if (pending) return;
    try {
      await mutation.mutateAsync(values.password);
      if (success) toast.success(success);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['password'])) {
        toast.error(getErrorMessage(error));
      }
    }
  });
  const error = form.formState.errors.password?.message;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            {children}
            <Field
              label={t('admin-security.yourPassword')}
              htmlFor="confirm-password"
              error={error}
              required
            >
              <PasswordInput
                id="confirm-password"
                autoComplete="current-password"
                autoFocus
                aria-invalid={!!error}
                {...form.register('password')}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant={variant} loading={pending}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
