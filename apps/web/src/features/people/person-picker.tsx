import { fullName, type PersonSummary } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
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
import { EmptyState, ErrorState, PageLoader, SearchInput } from '@/components/ui/misc';
import { getErrorMessage } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import { peopleListQuery } from './api';

/** Dialog for selecting one or more people from the church directory. */
export function PersonPickerDialog({
  churchId,
  open,
  onOpenChange,
  title,
  description,
  excludeIds = [],
  confirmLabel = 'Add',
  loading = false,
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
  onConfirm: (personIds: string[]) => void | Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const debounced = useDebounced(search);
  const people = useQuery({
    ...peopleListQuery(churchId, { q: debounced || undefined, limit: 200 }),
    enabled: open,
  });

  const reset = () => {
    setSearch('');
    setSelected([]);
  };

  const available = (people.data?.items ?? []).filter((person) => !excludeIds.includes(person.id));

  const toggle = (person: PersonSummary) =>
    setSelected((current) =>
      current.includes(person.id)
        ? current.filter((id) => id !== person.id)
        : [...current, person.id],
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <SearchInput value={search} onChange={setSearch} placeholder="Search people" />
        <DialogBody className="max-h-[45dvh] min-h-40">
          {people.isPending ? (
            <PageLoader />
          ) : people.isError ? (
            <ErrorState
              message={getErrorMessage(people.error)}
              onRetry={() => void people.refetch()}
            />
          ) : available.length === 0 ? (
            <EmptyState
              title="Nobody found"
              description={search ? 'Try a different search.' : 'Everyone is already added.'}
            />
          ) : (
            <ul className="flex flex-col">
              {available.map((person) => (
                <li key={person.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-2 hover:bg-muted/60">
                    <Checkbox
                      checked={selected.includes(person.id)}
                      onCheckedChange={() => toggle(person)}
                    />
                    <EntityAvatar name={fullName(person)} src={person.photoUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {fullName(person)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={selected.length === 0}
            loading={loading}
            onClick={async () => {
              await onConfirm(selected);
              reset();
            }}
          >
            {confirmLabel}
            {selected.length > 0 ? ` (${selected.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
