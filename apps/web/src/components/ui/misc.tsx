import { AlertCircle, CheckCircle2, Info, Loader2, Search, TriangleAlert, X } from 'lucide-react';
import * as React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Input } from './input';

export { Skeleton } from './skeleton';
export { EmptyState } from './empty-state';
export { ErrorState, NoAccessState } from './states';

export function Separator({ className, ...props }: React.ComponentProps<'hr'>) {
  return <hr className={cn('border-0 border-t border-border', className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Loader2
      className={cn('size-5 animate-spin text-muted-foreground', className)}
      aria-label={t('common.loading')}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex justify-center py-16" role="status">
      <Spinner className="size-6" />
    </div>
  );
}

const alertStyles = {
  info: { tone: 'info', icon: Info },
  warning: { tone: 'warning', icon: TriangleAlert },
  error: { tone: 'danger', icon: AlertCircle },
  success: { tone: 'success', icon: CheckCircle2 },
} as const;

export function Alert({
  variant = 'info',
  title,
  children,
  action,
  className,
}: {
  variant?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { tone, icon: Icon } = alertStyles[variant];
  return (
    <div
      data-tone={tone}
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex animate-in gap-3 rounded-xl border border-tone/25 bg-tone-soft/70 px-3.5 py-3 text-sm text-foreground fade-in-0',
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-tone-ink" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-tone-ink">{title}</p> : null}
        {children ? (
          <div className={cn('text-pretty', title && 'mt-0.5 text-muted-foreground')}>
            {children}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const { t } = useI18n();
  const label = placeholder ?? t('common.searchPlaceholder');
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.stopPropagation();
            onChange('');
          }
        }}
        placeholder={label}
        className="pr-10 pl-10 [&::-webkit-search-cancel-button]:hidden"
        aria-label={label}
        autoFocus={autoFocus}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t('common.clearSearch')}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** A compact number tile. For icons, trends and links use `StatCard`. */
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
      <p className="text-overline text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight tabular">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A segmented control: one choice out of a few, with arrow-key navigation. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  'aria-label': ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: React.ComponentType<{ className?: string }> }[];
  className?: string;
  'aria-label'?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const move = (index: number) => {
    const next = (index + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex h-11 w-full items-center rounded-xl bg-muted p-1', className)}
    >
      {options.map((option, index) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                move(index + 1);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(index - 1);
              }
            }}
            className={cn(
              'flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-all duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 [&_svg]:size-4',
              selected
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.icon ? <option.icon /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
