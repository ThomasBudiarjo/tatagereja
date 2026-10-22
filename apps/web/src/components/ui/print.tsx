import { Printer } from 'lucide-react';
import * as React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';

/*
 * Printing: the app chrome carries `data-print="hide"`, so `window.print()` prints the page
 * content only, on white. Put a `PrintHeader` at the top of printable pages (bulletins,
 * certificates, reports) and mark on-screen controls with `data-print="hide"`.
 */

export function PrintButton({
  label,
  ...props
}: Omit<ButtonProps, 'onClick'> & { label?: string }) {
  const { t } = useI18n();
  return (
    <Button variant="outline" data-print="hide" onClick={() => window.print()} {...props}>
      <Printer />
      {label ?? t('common.print')}
    </Button>
  );
}

/** A letterhead that only appears on paper: logo, church name, title and print date. */
export function PrintHeader({
  churchName,
  logoUrl,
  title,
  subtitle,
  className,
}: {
  churchName: string;
  logoUrl?: string | null;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  const { formatDate } = useI18n();
  return (
    <div data-print="only" className={cn('mb-6 border-b pb-4', className)}>
      <div className="flex items-center gap-3">
        {logoUrl ? <img src={logoUrl} alt="" className="size-12 object-contain" /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{churchName}</p>
          <p className="text-xl font-bold">{title}</p>
          {subtitle ? <p className="text-sm">{subtitle}</p> : null}
        </div>
        <p className="text-xs">{formatDate(new Date(), 'dateLong')}</p>
      </div>
    </div>
  );
}

/** Content laid out for paper: A4 width on screen preview, page breaks between sections. */
export function PrintSheet({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[210mm] rounded-xl border bg-card p-6 shadow-soft print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10',
        className,
      )}
      {...props}
    />
  );
}
