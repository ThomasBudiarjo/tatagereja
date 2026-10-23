import {
  PASSWORD_STRENGTH_LABELS,
  localize,
  passwordHints,
  passwordStrength,
  type PasswordHint,
} from '@tatagereja/shared';
import { Check, X } from 'lucide-react';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const HINT_KEYS: Record<PasswordHint, MessageKey> = {
  length: 'profile.hintLength',
  mixedCase: 'profile.hintMixedCase',
  number: 'profile.hintNumber',
  symbol: 'profile.hintSymbol',
  common: 'profile.hintCommon',
};

const BAR_TONES = ['bg-destructive', 'bg-destructive', 'bg-warning', 'bg-success/80', 'bg-success'];
const TEXT_TONES = [
  'text-destructive',
  'text-destructive',
  'text-warning-foreground dark:text-warning',
  'text-success',
  'text-success',
];

/**
 * A live strength meter under a new-password field: four bars, a word for the strength and
 * what would make it stronger. Advisory only; the server enforces the minimum length.
 */
export function PasswordStrengthMeter({ password, id }: { password: string; id?: string }) {
  const { t, locale } = useI18n();
  if (!password) return null;
  const { score, strength } = passwordStrength(password);
  const hints = passwordHints(password).filter((hint) => hint !== 'common' || score === 0);
  const checks: PasswordHint[] = ['length', 'mixedCase', 'number', 'symbol'];
  return (
    <div id={id} className="flex animate-in flex-col gap-2 fade-in-0" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={cn(
                'h-1.5 rounded-full transition-colors duration-200',
                score >= step ? BAR_TONES[score] : 'bg-muted',
              )}
            />
          ))}
        </div>
        <span className={cn('text-xs font-semibold', TEXT_TONES[score])}>
          {t('profile.strength', {
            strength: localize(PASSWORD_STRENGTH_LABELS[strength], locale),
          })}
        </span>
      </div>
      {hints.includes('common') ? (
        <p className="text-xs font-medium text-destructive">{t(HINT_KEYS.common)}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {checks.map((check) => {
            const done = !hints.includes(check);
            return (
              <li
                key={check}
                className={cn(
                  'flex items-center gap-1.5 text-xs transition-colors',
                  done ? 'text-success' : 'text-muted-foreground',
                )}
              >
                {done ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <X className="size-3.5 opacity-60" aria-hidden />
                )}
                {t(HINT_KEYS[check])}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
