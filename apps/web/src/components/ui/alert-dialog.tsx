import { TriangleAlert } from 'lucide-react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';
import { Input } from './input';
import { Label } from './label';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Say what will happen, in plain words: what is removed, who is affected. */
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonProps['variant'];
  loading?: boolean;
  /**
   * For irreversible actions: the confirm button stays disabled until this exact text (usually
   * the item's name) is typed.
   */
  confirmText?: string;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
};

/**
 * Asks before a destructive or consequential action. Focus returns to the element that opened
 * it; the dialog cannot be dismissed while the action is running.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'destructive',
  loading = false,
  confirmText,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const [typed, setTyped] = React.useState('');
  const inputId = React.useId();
  const destructive = variant === 'destructive';
  const matches = !confirmText || typed.trim() === confirmText.trim();
  // The translated sentence places the text to type; split around it to render it in bold.
  const prompt = t('common.typeToConfirm', { value: '\u0000' }).split('\u0000');

  const handleOpenChange = (next: boolean) => {
    if (loading) return;
    if (!next) setTyped('');
    onOpenChange(next);
  };

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialogPrimitive.Content
          onEscapeKeyDown={(event) => {
            if (loading) event.preventDefault();
          }}
          className={cn(
            'fixed inset-x-3 bottom-3 z-50 flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-overlay outline-none safe-bottom data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-6 sm:data-[state=open]:slide-in-from-bottom-0',
          )}
        >
          <div className="flex gap-3.5">
            {destructive ? (
              <span
                data-tone="danger"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tone-soft text-tone-ink"
                aria-hidden
              >
                <TriangleAlert className="size-5" />
              </span>
            ) : null}
            <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
              <AlertDialogPrimitive.Title className="text-lg leading-tight font-bold tracking-tight text-balance">
                {title}
              </AlertDialogPrimitive.Title>
              {description ? (
                <AlertDialogPrimitive.Description className="text-sm text-pretty text-muted-foreground">
                  {description}
                </AlertDialogPrimitive.Description>
              ) : (
                <AlertDialogPrimitive.Description className="sr-only">
                  {title}
                </AlertDialogPrimitive.Description>
              )}
            </div>
          </div>
          {children}
          {confirmText ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={inputId} className="leading-snug font-normal text-muted-foreground">
                <span>
                  {prompt[0]}
                  <strong className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] font-semibold text-foreground">
                    {confirmText}
                  </strong>
                  {prompt[1]}
                </span>
              </Label>
              <Input
                id={inputId}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && matches && !loading) {
                    event.preventDefault();
                    void onConfirm();
                  }
                }}
              />
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="outline" disabled={loading}>
                {cancelLabel ?? t('common.cancel')}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <Button
              variant={variant}
              loading={loading}
              disabled={!matches}
              onClick={(event) => {
                event.preventDefault();
                void onConfirm();
              }}
            >
              {confirmLabel ?? t('common.confirm')}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export { ConfirmDialog };
