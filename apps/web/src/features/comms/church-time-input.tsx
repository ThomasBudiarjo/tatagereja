import * as React from 'react';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { fromChurchInput, toChurchInput } from './church-time';

type Props = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (iso: string) => void;
};

/** A datetime input in the church time zone; the value is an ISO instant or ''. */
export function ChurchDateTimeInput({ value, onChange, ...props }: Props) {
  const { timeZone } = useI18n();
  return (
    <Input
      type="datetime-local"
      value={toChurchInput(value, timeZone)}
      onChange={(event) => onChange(fromChurchInput(event.target.value, timeZone))}
      {...props}
    />
  );
}
