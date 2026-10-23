import { ArrowLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ToneIcon } from '@/components/ui/status-badge';
import type { Tone } from '@/components/ui/tone';
import { useI18n } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { cn } from '@/lib/utils';

const widths = {
  narrow: 'max-w-xl',
  default: 'max-w-3xl',
  wide: 'max-w-6xl',
  full: 'max-w-none',
};

/** Page container. `wide` suits tables, boards and dashboards. */
export function Page({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: keyof typeof widths }) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-5 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:py-8',
        widths[size],
        className,
      )}
      {...props}
    />
  );
}

export type Breadcrumb = { label: string; to?: string };

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** Where the back button goes; defaults to the last breadcrumb with a link. */
  backTo?: string;
  backLabel?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
  /** A module icon chip next to the title. */
  icon?: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  /** Sets `document.title`; defaults to the title when it is a string. */
  documentTitle?: string | false;
  className?: string;
};

export function Breadcrumbs({ items, className }: { items: Breadcrumb[]; className?: string }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('common.breadcrumbs')} className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {item.to && !last ? (
                <Link
                  to={item.to}
                  className="truncate rounded-sm transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn('truncate', last && 'font-medium text-foreground')}
                  aria-current={last ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  backTo,
  backLabel,
  breadcrumbs,
  actions,
  icon,
  tone = 'brand',
  documentTitle,
  className,
}: PageHeaderProps) {
  const { t } = useI18n();
  useDocumentTitle(
    documentTitle === false ? null : (documentTitle ?? (typeof title === 'string' ? title : null)),
  );
  const back = backTo ?? [...(breadcrumbs ?? [])].reverse().find((item) => item.to)?.to;
  const hasTrail = !!breadcrumbs && breadcrumbs.length > 1;

  return (
    <header className={cn('flex animate-page-in flex-col gap-3', className)}>
      {back || hasTrail ? (
        <div className="flex min-h-9 items-center gap-2 print:hidden">
          {back ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className={cn('-ml-2.5 w-fit text-muted-foreground', hasTrail && 'md:hidden')}
            >
              <Link to={back}>
                <ArrowLeft />
                {backLabel ?? t('common.back')}
              </Link>
            </Button>
          ) : null}
          {hasTrail ? <Breadcrumbs items={breadcrumbs} className="hidden md:block" /> : null}
        </div>
      ) : null}
      {/*
        One grid so the description runs under the icon at full width on phones, where the
        actions would otherwise squeeze it into a narrow column, and under the title from `sm`.
      */}
      <div
        className={cn(
          'grid items-start gap-x-3.5 gap-y-2',
          icon ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
        )}
      >
        {icon ? <ToneIcon icon={icon} tone={tone} size="lg" /> : null}
        <div className={cn('min-w-0', icon && 'self-center')}>
          {eyebrow ? (
            <p data-tone={tone} className="text-overline mb-1 text-tone-ink">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance sm:text-[1.75rem]">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-0.5">
          {actions}
        </div>
        {description ? (
          <p
            className={cn(
              'col-span-full max-w-2xl text-sm text-pretty text-muted-foreground sm:-mt-0.5 sm:text-[0.9375rem]',
              icon && 'sm:col-start-2',
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
    </header>
  );
}

export function Section({
  title,
  description,
  action,
  icon: Icon,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3', className)}>
      {title || action ? (
        // Actions move under the title on narrow screens instead of squeezing it.
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-56">
            {title ? (
              <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold tracking-tight">
                {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
