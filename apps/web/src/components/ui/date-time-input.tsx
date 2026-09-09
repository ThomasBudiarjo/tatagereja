import * as React from 'react';
import { isoToLocalInput, localInputToIso } from '@/lib/format';
import { Input } from './input';

type Props = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  /** ISO datetime string (UTC) or empty string. */
  value: string;
  onChange: (iso: string) => void;
};

/** A datetime-local input whose value is an ISO string, so shared schemas validate it directly. */
export function DateTimeInput({ value, onChange, ...props }: Props) {
  return (
    <Input
      type="datetime-local"
      value={isoToLocalInput(value)}
      onChange={(event) => onChange(localInputToIso(event.target.value))}
      {...props}
    />
  );
}
