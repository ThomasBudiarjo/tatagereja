import { useQuery } from '@tanstack/react-query';
import { PenLine, Trash2, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { recordsPeopleQuery } from './api';

export type PersonValue = { personId: string | null; name: string | null };

export type PickedPerson = { id: string; name: string; birthDate: string | null };

/**
 * One person on a record: a church member chosen from the directory, or a name typed for
 * someone outside the congregation (a witness from another church, a parent who is not a
 * member). Members are searched on the server as people type.
 */
export function PersonField({
  id,
  label,
  value,
  onChange,
  onPicked,
  onRemove,
  required = false,
  error,
  allowName = true,
  description,
}: {
  id: string;
  label: string;
  value: PersonValue;
  onChange: (value: PersonValue) => void;
  /** Called when a member is chosen, with their birth date for prefilling. */
  onPicked?: (person: PickedPerson) => void;
  onRemove?: () => void;
  required?: boolean;
  error?: string;
  allowName?: boolean;
  description?: string;
}) {
  const { churchId } = useChurch();
  const { t, formatDate } = useI18n();
  const [preferred, setPreferred] = useState<'member' | 'name'>(
    !value.personId && value.name && allowName ? 'name' : 'member',
  );
  // A filled value decides the mode, so a field reused for another person shows it correctly.
  const mode = value.personId ? 'member' : value.name && allowName ? 'name' : preferred;
  const [search, setSearch] = useState('');
  const people = useQuery({ ...recordsPeopleQuery(churchId, search), enabled: mode === 'member' });

  const options = useMemo<ComboboxOption[]>(() => {
    const found = (people.data?.items ?? []).map((person) => {
      const name = [person.firstName, person.lastName].filter(Boolean).join(' ');
      return {
        value: person.id,
        label: name,
        description: person.birthDate
          ? t('records.bornOn', { date: formatDate(person.birthDate, 'dateShort') })
          : undefined,
        leading: <EntityAvatar name={name} src={person.photoUrl} size="xs" />,
      };
    });
    // Keep the chosen person so the trigger can show their name.
    if (value.personId && !found.some((option) => option.value === value.personId)) {
      found.unshift({
        value: value.personId,
        label: value.name ?? '…',
        description: undefined,
        leading: <EntityAvatar name={value.name ?? '?'} size="xs" />,
      });
    }
    return found;
  }, [people.data, value.personId, value.name, t, formatDate]);

  const switchMode = () => {
    setPreferred(mode === 'member' ? 'name' : 'member');
    onChange({ personId: null, name: null });
  };

  return (
    <Field label={label} htmlFor={id} required={required} error={error} description={description}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {mode === 'member' ? (
            <Combobox
              id={id}
              options={options}
              value={value.personId}
              onChange={(personId) => {
                const option = options.find((item) => item.value === personId);
                onChange({ personId, name: option?.label ?? null });
                const person = people.data?.items.find((item) => item.id === personId);
                if (person && option) {
                  onPicked?.({ id: person.id, name: option.label, birthDate: person.birthDate });
                }
              }}
              onSearchChange={setSearch}
              loading={people.isFetching}
              placeholder={t('records.choosePerson')}
              searchPlaceholder={t('records.searchPeople')}
              emptyText={t('records.noPeopleFound')}
              clearable
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
            />
          ) : (
            <Input
              id={id}
              value={value.name ?? ''}
              onChange={(event) => onChange({ personId: null, name: event.target.value })}
              placeholder={t('records.typeName')}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              autoComplete="off"
            />
          )}
        </div>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={t('records.removePerson', { label })}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
      {allowName ? (
        <button
          type="button"
          onClick={switchMode}
          className="flex min-h-8 w-fit items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          {mode === 'member' ? (
            <>
              <PenLine className="size-3.5" />
              {t('records.notAMember')}
            </>
          ) : (
            <>
              <UsersRound className="size-3.5" />
              {t('records.pickMember')}
            </>
          )}
        </button>
      ) : null}
    </Field>
  );
}
