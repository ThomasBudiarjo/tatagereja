import { CloudOff, Lock, PowerOff, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { EmptyIllustration } from './empty-state';

/** A failed load with a retry. `message` is usually `getErrorMessage(query.error)`. */
export function ErrorState({
  title,
  message,
  error,
  onRetry,
  retrying = false,
  compact = false,
  className,
}: {
  title?: string;
  message?: string;
  /** When given and it is a network error, the state says so. */
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const network = isApiClientError(error) && error.code === 'NETWORK';
  return (
    <div
      role="alert"
      className={cn(
        'flex animate-rise-in flex-col items-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/[0.04] text-center',
        compact ? 'px-5 py-6' : 'px-6 py-9',
        className,
      )}
    >
      <EmptyIllustration icon={network ? CloudOff : RefreshCw} tone="danger" size="sm" />
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-semibold tracking-tight">{title ?? t('common.errorTitle')}</p>
        <p className="text-sm text-pretty text-muted-foreground">
          {message ?? t('common.errorDescription')}
        </p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} loading={retrying}>
          {!retrying ? <RefreshCw /> : null}
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Shown instead of a page the caller may not open, or of a module the church switched off.
 * The API refuses the data either way; this keeps direct links friendly.
 */
export function NoAccessState({
  variant = 'forbidden',
  moduleName,
  title,
  description,
  action,
  className,
}: {
  variant?: 'forbidden' | 'module-off';
  moduleName?: string;
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const off = variant === 'module-off';
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-md animate-rise-in flex-col items-center gap-4 px-6 py-14 text-center',
        className,
      )}
    >
      <EmptyIllustration icon={off ? PowerOff : Lock} tone={off ? 'slate' : 'warning'} />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-bold tracking-tight text-balance">
          {title ??
            (off
              ? t('common.moduleOffTitle', { module: moduleName ?? '' })
              : t('common.noAccessTitle'))}
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {description ??
            (off ? t('common.moduleOffDescription') : t('common.noAccessDescription'))}
        </p>
      </div>
      {action}
    </div>
  );
}
