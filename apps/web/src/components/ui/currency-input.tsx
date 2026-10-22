import { currencyMinorDigits, LIMITS } from '@tatagereja/shared';
import * as React from 'react';
import { INTL_LOCALE, useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  /** Integer minor units (rupiah for IDR, cents for USD); null when empty. */
  value: number | null;
  onChange: (minor: number | null) => void;
  /** Defaults to the church currency. */
  currency?: string;
};

/**
 * An amount field that groups thousands as people type ("1.500.000") and hands back integer
 * minor units, so money is never a float. IDR has no decimals; other currencies accept two.
 */
export function CurrencyInput({ value, onChange, currency, className, ...props }: Props) {
  const { locale, currency: churchCurrency } = useI18n();
  const code = currency ?? churchCurrency;
  const digits = currencyMinorDigits(code);
  const parts = React.useMemo(() => {
    const formatter = new Intl.NumberFormat(INTL_LOCALE[locale], {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    });
    const sample = formatter.formatToParts(1234.5);
    return {
      group: sample.find((part) => part.type === 'group')?.value ?? '.',
      decimal: sample.find((part) => part.type === 'decimal')?.value ?? ',',
      symbol: sample.find((part) => part.type === 'currency')?.value ?? code,
    };
  }, [locale, code]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const format = React.useCallback(
    (whole: string, fraction: string | null) => {
      const grouped = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, parts.group);
      return fraction === null ? grouped : `${grouped || '0'}${parts.decimal}${fraction}`;
    },
    [parts],
  );

  const display = React.useMemo(() => {
    if (value === null || Number.isNaN(value)) return '';
    const whole = Math.trunc(value / 10 ** digits);
    const fraction =
      digits > 0 ? String(Math.abs(value) % 10 ** digits).padStart(digits, '0') : null;
    return format(String(whole), fraction && fraction !== '0'.repeat(digits) ? fraction : null);
  }, [value, digits, format]);

  const [text, setText] = React.useState(display);
  const [shown, setShown] = React.useState(display);
  // The value changed from outside (form reset): show it.
  if (display !== shown) {
    setShown(display);
    setText(display);
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, '').length;
    const decimalIndex = digits > 0 ? raw.lastIndexOf(parts.decimal) : -1;
    const wholeRaw = (decimalIndex >= 0 ? raw.slice(0, decimalIndex) : raw).replace(/\D/g, '');
    const fractionRaw =
      decimalIndex >= 0
        ? raw
            .slice(decimalIndex + 1)
            .replace(/\D/g, '')
            .slice(0, digits)
        : null;
    if (!wholeRaw && !fractionRaw) {
      setText('');
      onChange(null);
      return;
    }
    const next = format(wholeRaw, fractionRaw);
    const minor =
      Number(wholeRaw || '0') * 10 ** digits +
      Number((fractionRaw ?? '').padEnd(digits, '0') || '0');
    if (minor > LIMITS.moneyMax) return;
    setText(next);
    setShown(
      format(
        wholeRaw,
        fractionRaw && /[1-9]/.test(fractionRaw) ? fractionRaw.padEnd(digits, '0') : null,
      ),
    );
    onChange(minor);
    // Keep the caret after the same digit once separators move.
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      let seen = 0;
      let position = 0;
      while (position < next.length && seen < digitsBeforeCaret) {
        if (/\d/.test(next[position] ?? '')) seen += 1;
        position += 1;
      }
      input.setSelectionRange(position, position);
    });
  };

  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-medium text-muted-foreground"
      >
        {parts.symbol}
      </span>
      <input
        placeholder="0"
        {...props}
        ref={inputRef}
        type="text"
        inputMode={digits > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={text}
        onChange={handleChange}
        onBlur={(event) => {
          setText(display);
          props.onBlur?.(event);
        }}
        className={cn(
          'flex h-11 w-full min-w-0 rounded-lg border border-input bg-card py-2 pr-3.5 pl-11 text-right text-base font-medium text-foreground shadow-xs transition-[color,box-shadow] outline-none tabular placeholder:font-normal placeholder:text-muted-foreground/75 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm',
          className,
        )}
      />
    </div>
  );
}
