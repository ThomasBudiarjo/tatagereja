import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A one-time code field: numeric keyboard and SMS/password-manager autofill for authenticator
 * codes, letters for recovery codes. Calls `onComplete` when a full authenticator code is
 * typed or pasted, so people do not need to press the button.
 */
export function OtpInput({
  mode = 'totp',
  value,
  onChange,
  onComplete,
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  mode?: 'totp' | 'recovery';
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
}) {
  const totp = mode === 'totp';
  const ref = React.useRef<HTMLInputElement>(null);
  // Checking a complete code disables the field, which drops focus; give it back afterwards
  // so a wrong code can be retyped straight away.
  const refocus = React.useRef(false);
  React.useEffect(() => {
    if (!props.disabled && refocus.current) {
      refocus.current = false;
      ref.current?.focus();
    }
  }, [props.disabled]);
  return (
    <Input
      {...props}
      ref={ref}
      value={value}
      inputMode={totp ? 'numeric' : 'text'}
      autoComplete={totp ? 'one-time-code' : 'off'}
      autoCapitalize={totp ? 'off' : 'characters'}
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="done"
      maxLength={totp ? 7 : 11}
      placeholder={totp ? '000000' : 'XXXXX-XXXXX'}
      className={cn(
        'h-14 text-center font-mono text-2xl font-semibold tracking-[0.4em] placeholder:tracking-[0.4em] placeholder:text-muted-foreground/40 md:text-2xl',
        !totp && 'text-xl tracking-[0.2em] uppercase placeholder:tracking-[0.2em] md:text-xl',
        className,
      )}
      onChange={(event) => {
        const next = totp
          ? event.target.value.replace(/\D/g, '').slice(0, 6)
          : event.target.value
              .toUpperCase()
              .replace(/[^A-Z0-9-]/g, '')
              .slice(0, 11);
        onChange(next);
        if (totp && next.length === 6 && next !== value && onComplete) {
          refocus.current = true;
          onComplete(next);
        }
      }}
    />
  );
}
