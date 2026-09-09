import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export function ListGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft',
        className,
      )}
      {...props}
    />
  );
}

type ListRowProps = {
  to?: string;
  onClick?: () => void;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
  className?: string;
};

export function ListRow({
  to,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  className,
}: ListRowProps) {
  const interactive = !!to || !!onClick;
  const content = (
    <>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        {subtitle ? <div className="truncate text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="shrink-0 text-sm text-muted-foreground">{trailing}</div> : null}
      {(chevron ?? !!to) ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
      ) : null}
    </>
  );
  const classes = cn(
    'flex w-full items-center gap-3 px-4 py-3 text-left',
    interactive && 'transition-colors hover:bg-muted/60 active:bg-muted',
    className,
  );
  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
