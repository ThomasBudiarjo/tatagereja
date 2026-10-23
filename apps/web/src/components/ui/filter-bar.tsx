import { ArrowUpDown, Check, ChevronDown, UserRound, X } from 'lucide-react';
import * as React from 'react';
import { useEffect, useEffectEvent, useState } from 'react';
import { useLocation } from 'react-router';
import { useI18n } from '@/lib/i18n';
import { useDebounced } from '@/lib/use-debounced';
import { cn } from '@/lib/utils';
import { EntityAvatar } from './avatar';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { SearchInput } from './misc';

export type FilterOption = { value: string; label: string; count?: number };

export type FilterDefinition =
  | {
      id: string;
      label: string;
      options: FilterOption[];
      multiple?: false;
      /** '' means no filter. */
      value: string;
      onChange: (value: string) => void;
    }
  | {
      id: string;
      label: string;
      options: FilterOption[];
      multiple: true;
      value: readonly string[];
      onChange: (value: string[]) => void;
    };

export type SortOption = { value: string; label: string };

/**
 * Search, filter chips and sort for a list. Pair it with `useUrlState` so every choice lives in
 * the URL. The search input is debounced; the list updates as people type.
 */
export function FilterBar({
  search,
  filters = [],
  sort,
  onReset,
  actions,
  className,
}: {
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  filters?: FilterDefinition[];
  sort?: { value: string; options: SortOption[]; onChange: (value: string) => void };
  /** Clears search and filters; shown when something is active. */
  onReset?: () => void;
  actions?: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const active =
    filters.filter((filter) => (filter.multiple ? filter.value.length > 0 : !!filter.value))
      .length + (search?.value ? 1 : 0);

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-center gap-2">
        {search ? <DebouncedSearch {...search} /> : null}
        {actions}
      </div>
      {filters.length > 0 || sort ? (
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
          {filters.map((filter) => (
            <FilterChip key={filter.id} filter={filter} />
          ))}
          {sort ? <SortMenu {...sort} /> : null}
          {onReset && active > 0 ? (
            <button
              type="button"
              onClick={onReset}
              className="ml-auto h-9 shrink-0 rounded-full px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t('common.clearAll')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DebouncedSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const [agreed, setAgreed] = useState(value);
  const debounced = useDebounced(text, 300);

  // The URL changed from outside (back button, "clear all"): show its value.
  if (value !== agreed) {
    setAgreed(value);
    if (value !== debounced) setText(value);
  }

  const emit = useEffectEvent((next: string) => {
    if (next !== value) onChange(next);
  });
  useEffect(() => {
    emit(debounced.trim() === '' ? '' : debounced);
  }, [debounced]);

  return (
    <SearchInput
      value={text}
      onChange={(next) => {
        setText(next);
        // Clearing is applied at once so the full list returns without a delay.
        if (next === '') onChange('');
      }}
      placeholder={placeholder}
      className="min-w-0 flex-1"
    />
  );
}

const chipClass = (active: boolean) =>
  cn(
    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:ring-[3px] data-[state=open]:ring-ring/20',
    active
      ? 'border-primary/30 bg-accent text-accent-foreground'
      : 'border-input bg-card text-foreground hover:bg-muted',
  );

function FilterChip({ filter }: { filter: FilterDefinition }) {
  const { t } = useI18n();
  const selected = filter.multiple
    ? filter.options.filter((option) => filter.value.includes(option.value))
    : filter.options.filter((option) => option.value === filter.value);
  const isActive = selected.length > 0;
  const summary =
    selected.length === 0
      ? null
      : selected.length === 1
        ? selected[0]?.label
        : t('common.selected', { count: selected.length });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={chipClass(isActive)}
        aria-label={t('common.filterBy', { name: filter.label })}
      >
        {isActive ? <Check className="size-3.5" aria-hidden /> : null}
        <span className={cn(isActive && 'text-accent-foreground/80')}>{filter.label}</span>
        {summary ? (
          <>
            <span className="opacity-40" aria-hidden>
              ·
            </span>
            <span className="max-w-32 truncate font-semibold">{summary}</span>
          </>
        ) : null}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
        {filter.multiple ? (
          filter.options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={filter.value.includes(option.value)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                filter.onChange(
                  checked
                    ? [...filter.value, option.value]
                    : filter.value.filter((value) => value !== option.value),
                )
              }
            >
              <OptionLabel option={option} />
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <DropdownMenuRadioGroup value={filter.value} onValueChange={filter.onChange}>
            <DropdownMenuRadioItem value="">{t('common.all')}</DropdownMenuRadioItem>
            {filter.options.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <OptionLabel option={option} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
        {filter.multiple && isActive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => filter.onChange([])}>
              <X />
              {t('common.clear')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OptionLabel({ option }: { option: FilterOption }) {
  return (
    <span className="flex flex-1 items-center justify-between gap-3">
      {option.label}
      {option.count !== undefined ? (
        <span className="text-xs text-muted-foreground tabular">{option.count}</span>
      ) : null}
    </span>
  );
}

function SortMenu({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SortOption[];
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const current = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={chipClass(false)} aria-label={t('common.sortBy')}>
        <ArrowUpDown className="size-3.5 opacity-70" aria-hidden />
        <span className="max-w-40 truncate">{current?.label ?? t('common.sort')}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t('common.sortBy')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A list narrowed to one person by a deep link (`?personId=`), usually from their profile: who
 * it shows and a way back to everyone. Pass the name once the list has loaded a row for them;
 * until then (or when they have no rows) it uses the `personName` the linking page put in the
 * navigation state.
 */
export function PersonFilterNotice({
  name,
  photoUrl,
  onClear,
  actions,
  className,
}: {
  name?: string | null;
  photoUrl?: string | null;
  onClear: () => void;
  /** More about this person, such as their statement. */
  actions?: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const location = useLocation();
  const linked = (location.state as { personName?: unknown } | null)?.personName;
  const shown = name || (typeof linked === 'string' ? linked : null);
  return (
    <div
      role="status"
      className={cn(
        'flex animate-in items-center gap-2.5 rounded-xl border border-border/70 bg-muted/40 py-1.5 pr-1.5 pl-2.5 text-sm fade-in-0',
        className,
      )}
    >
      {shown ? (
        <EntityAvatar name={shown} src={photoUrl} size="xs" className="shrink-0" />
      ) : (
        <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="line-clamp-2 min-w-0 flex-1 leading-snug">
        {shown ? t('common.filteredToPerson', { name: shown }) : t('common.filteredToOnePerson')}
      </span>
      {actions}
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 max-sm:size-10 max-sm:px-0"
        onClick={onClear}
      >
        <X />
        <span className="max-sm:sr-only">{t('common.showEveryone')}</span>
      </Button>
    </div>
  );
}
