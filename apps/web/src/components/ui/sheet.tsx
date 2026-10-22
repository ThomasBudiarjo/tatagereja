import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import * as React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

type Side = 'auto' | 'right' | 'left' | 'bottom';

const sides: Record<Side, string> = {
  /** A bottom sheet on phones and a side panel from 640px. */
  auto: 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t safe-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:inset-y-0 sm:right-0 sm:left-auto sm:h-dvh sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl sm:border-t-0 sm:border-l sm:data-[state=closed]:slide-out-to-right sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-right sm:data-[state=open]:slide-in-from-bottom-0',
  right:
    'inset-y-0 right-0 h-dvh w-[88vw] max-w-md rounded-l-2xl border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
  left: 'inset-y-0 left-0 h-dvh w-[85vw] max-w-xs rounded-r-2xl border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
  bottom:
    'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t safe-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
};

function SheetContent({
  className,
  children,
  side = 'auto',
  hideClose = false,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: Side; hideClose?: boolean }) {
  const { t } = useI18n();
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <SheetPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-card p-5 shadow-overlay outline-none data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=open]:duration-300',
          sides[side],
          className,
        )}
        {...props}
      >
        {side === 'auto' || side === 'bottom' ? (
          <div
            className={cn(
              'mx-auto -mt-1 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/25',
              side === 'auto' && 'sm:hidden',
            )}
            aria-hidden
          />
        ) : null}
        {children}
        {!hideClose ? (
          <SheetPrimitive.Close
            className={cn(
              'absolute top-3.5 right-3.5 flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40',
              side === 'auto' && 'hidden sm:flex',
            )}
          >
            <X className="size-4" />
            <span className="sr-only">{t('common.close')}</span>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 pr-10 text-left', className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn('text-lg leading-tight font-bold tracking-tight', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('-mx-5 min-h-0 flex-1 overflow-y-auto px-5', className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
};
