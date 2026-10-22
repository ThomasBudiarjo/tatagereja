import { Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type Step = { id: string; label: string; description?: string };

/**
 * Progress through a multi-step flow (offering count, registry entry, check-in). Phones show
 * "Step 2 of 4" with a bar; wider screens show every step. Completed steps can be revisited
 * when `onStepClick` is given.
 */
export function Stepper({
  steps,
  current,
  onStepClick,
  className,
}: {
  steps: Step[];
  /** Index of the current step. */
  current: number;
  onStepClick?: (index: number) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const active = steps[current];
  return (
    <nav
      aria-label={t('common.stepOf', { step: current + 1, total: steps.length })}
      className={className}
    >
      <div className="flex flex-col gap-2 sm:hidden">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold">{active?.label}</span>
          <span className="text-muted-foreground tabular">
            {t('common.stepOf', { step: current + 1, total: steps.length })}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${((current + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
      <ol className="hidden items-start sm:flex">
        {steps.map((step, index) => {
          const done = index < current;
          const isCurrent = index === current;
          const clickable = !!onStepClick && done;
          const marker = (
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                done && 'border-primary bg-primary text-primary-foreground',
                isCurrent && 'border-primary bg-card text-primary',
                !done && !isCurrent && 'border-border bg-card text-muted-foreground',
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
            </span>
          );
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? 'step' : undefined}
              className="flex flex-1 items-start last:flex-none"
            >
              <div className="flex flex-col items-center gap-1.5 text-center">
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(index)}
                    className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  >
                    {marker}
                  </button>
                ) : (
                  marker
                )}
                <span
                  className={cn(
                    'max-w-28 text-xs font-medium',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'mx-2 mt-4 h-0.5 flex-1 rounded-full transition-colors',
                    done ? 'bg-primary' : 'bg-border',
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
