import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/*
 * The element focused last outside any dialog or menu, tracked for the whole page. A dialog
 * opened from a menu item mounts after the item is gone, and focus stays trapped while a dialog
 * is open, so this is the element that opened it (the menu's trigger, say).
 */
let lastFocusedOutside: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      !target.closest('[role="dialog"],[role="alertdialog"],[role="menu"]')
    ) {
      lastFocusedOutside = target;
    }
  });
}

/**
 * Radix returns focus to a `Trigger`; dialogs opened from state have none, so focus would fall
 * back to the page: refocus the element that opened the dialog on close instead. Pass the
 * result as the primitive Content's `onCloseAutoFocus`.
 */
function useReturnFocus(onCloseAutoFocus?: (event: Event) => void) {
  return (event: Event) => {
    onCloseAutoFocus?.(event);
    const opener = lastFocusedOutside;
    if (event.defaultPrevented || !opener?.isConnected || opener === document.body) return;
    event.preventDefault();
    opener.focus();
  };
}

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  hideClose = false,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { hideClose?: boolean }) {
  const { t } = useI18n();
  const returnFocus = useReturnFocus(onCloseAutoFocus);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col gap-4 rounded-t-2xl border-t bg-card p-5 shadow-overlay safe-bottom outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:p-6 sm:data-[state=closed]:zoom-out-95 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:slide-in-from-bottom-0',
          className,
        )}
        onCloseAutoFocus={returnFocus}
        {...props}
      >
        <div
          className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/30 sm:hidden"
          aria-hidden
        />
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close className="absolute top-3.5 right-3.5 hidden size-9 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:flex">
            <X className="size-4" />
            <span className="sr-only">{t('common.close')}</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 text-left', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-lg leading-tight font-bold tracking-tight', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/** `min-h-0` lets the body shrink inside the flex column so the footer stays visible. */
const DialogBody = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('-mx-1 min-h-0 flex-1 overflow-y-auto px-1', className)} {...props} />
);

export {
  useReturnFocus,
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogBody,
};
