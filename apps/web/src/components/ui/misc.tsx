import { AlertCircle, Loader2, Search, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-lg bg-muted', className)} {...props} />;
}

export function Separator({ className, ...props }: React.ComponentProps<'hr'>) {
  return <hr className={cn('border-0 border-t border-border', className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn('size-5 animate-spin text-muted-foreground', className)}
      aria-label="Loading"
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex justify-center py-16">
      <Spinner className="size-6" />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      {Icon ? (
        <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="size-6" />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center',
        className,
      )}
    >
      <AlertCircle className="size-6 text-destructive" />
      <p className="text-sm">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Alert({
  variant = 'info',
  title,
  children,
  className,
}: {
  variant?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: 'border-border bg-muted/60 text-foreground',
    warning: 'border-warning/50 bg-warning/15 text-warning-foreground',
    error: 'border-destructive/30 bg-destructive/8 text-destructive',
    success: 'border-success/30 bg-success/10 text-success',
  };
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn('rounded-lg border px-3.5 py-3 text-sm', styles[variant], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        inputMode="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pr-9 pl-9"
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border/70 bg-card p-4 shadow-soft', className)}>
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex h-10 w-full items-center rounded-lg bg-muted p-1', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-full flex-1 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
            value === option.value
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
