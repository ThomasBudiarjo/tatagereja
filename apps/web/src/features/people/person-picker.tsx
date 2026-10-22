import { fullName, type PersonSummary } from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, UserSearch } from 'lucide-react';
import { useState } from 'react';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/misc';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useDebounced } from '@/lib/use-debounced';
import { cn } from '@/lib/utils';
import { peopleListQuery } from './api';

/** Dialog for selecting one or more people from the church directory. */
export function PersonPickerDialog({
  churchId,
  open,
  onOpenChange,
  title,
  description,
  excludeIds = [],
  confirmLabel,
  loading = false,
  single = false,
  onConfirm,
}: {
  churchId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  excludeIds?: string[];
  confirmLabel?: string;
  loading?: boolean;
  /** Choose exactly one person. */
  single?: boolean;
  onConfirm: (personIds: string[]) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const debounced = useDebounced(search);
  const people = useQuery({
    ...peopleListQuery(churchId, { q: debounced || undefined, limit: 100 }),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const reset = () => {
    setSearch('');
    setSelected([]);
  };

  const available = (people.data?.items ?? []).filter((person) => !excludeIds.includes(person.id));

  const toggle = (person: PersonSummary) =>
    setSelected((current) =>
      single
        ? [person.id]
        : current.includes(person.id)
          ? current.filter((id) => id !== person.id)
          : [...current, person.id],
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (loading) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('people.searchPeople')}
          autoFocus
        />
        <DialogBody className="max-h-[45dvh] min-h-48">
          {people.isPending ? (
            <SkeletonList rows={4} className="border-0 shadow-none" />
          ) : people.isError ? (
            <ErrorState
              compact
              message={getErrorMessage(people.error)}
              onRetry={() => void people.refetch()}
            />
          ) : available.length === 0 ? (
            <EmptyState
              compact
              icon={UserSearch}
              tone="sky"
              title={t('people.pickerEmpty')}
              description={search ? t('common.noResultsHint') : t('people.pickerAllAdded')}
            />
          ) : (
            <ul className="flex flex-col py-1">
              {available.map((person) => {
                const checked = selected.includes(person.id);
                const name = fullName(person);
                return (
                  <li key={person.id}>
                    <label
                      className={cn(
                        'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60',
                        checked && 'bg-accent/60',
                      )}
                    >
                      {single ? (
                        <input
                          type="radio"
                          name="person-picker"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggle(person)}
                        />
                      ) : (
                        <Checkbox checked={checked} onCheckedChange={() => toggle(person)} />
                      )}
                      <EntityAvatar name={name} src={person.photoUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{name}</span>
                        {person.householdName ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {person.householdName}
                          </span>
                        ) : null}
                      </span>
                      {single && checked ? (
                        <Check className="size-4 text-primary" aria-hidden />
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={selected.length === 0}
            loading={loading}
            onClick={async () => {
              await onConfirm(selected);
              reset();
            }}
          >
            {confirmLabel ?? t('common.add')}
            {!single && selected.length > 0 ? ` (${selected.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
