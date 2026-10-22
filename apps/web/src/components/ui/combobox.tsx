import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';
import * as React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
  /** An avatar or icon in front of the label. */
  leading?: React.ReactNode;
  /** Extra words that match the search (nickname, phone). */
  keywords?: string[];
  disabled?: boolean;
};

type BaseProps = {
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /**
   * Server-side search: called with the debounced text. Without it options are filtered
   * locally. Keep already selected options in `options` so their labels can be shown.
   */
  onSearchChange?: (search: string) => void;
  loading?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
  clearable?: boolean;
};

type MultipleProps = BaseProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
  clearable?: boolean;
};

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/**
 * A searchable select for long lists (people, groups, songs). Keyboard: type to filter, ↑ ↓
 * to move, Enter to choose, Esc to close. `PersonPicker`-style pickers wrap it with their own
 * query and pass `onSearchChange`.
 */
export function Combobox(props: SingleProps | MultipleProps) {
  const {
    options,
    placeholder,
    searchPlaceholder,
    emptyText,
    onSearchChange,
    loading = false,
    disabled = false,
    id,
    className,
  } = props;
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listId = React.useId();
  const listRef = React.useRef<HTMLUListElement>(null);

  const selectedValues = props.multiple ? props.value : props.value ? [props.value] : [];
  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));

  const filtered = React.useMemo(() => {
    if (onSearchChange || !search.trim()) return options;
    const needle = normalize(search.trim());
    return options.filter((option) =>
      [option.label, option.description ?? '', ...(option.keywords ?? [])].some((text) =>
        normalize(text).includes(needle),
      ),
    );
  }, [options, search, onSearchChange]);

  React.useEffect(() => {
    if (!onSearchChange) return;
    const timer = setTimeout(() => onSearchChange(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search, onSearchChange]);

  const choose = (option: ComboboxOption) => {
    if (option.disabled) return;
    if (props.multiple) {
      props.onChange(
        props.value.includes(option.value)
          ? props.value.filter((value) => value !== option.value)
          : [...props.value, option.value],
      );
    } else {
      props.onChange(option.value);
      setOpen(false);
    }
  };

  const moveTo = (index: number) => {
    const next = Math.max(0, Math.min(filtered.length - 1, index));
    setActiveIndex(next);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const triggerLabel =
    selectedOptions.length === 0
      ? null
      : props.multiple
        ? selectedOptions.length === 1
          ? selectedOptions[0]?.label
          : t('common.selected', { count: selectedOptions.length })
        : selectedOptions[0]?.label;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSearch('');
          setActiveIndex(0);
        }
      }}
    >
      <div className={cn('relative', className)}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-haspopup="listbox"
            aria-invalid={props['aria-invalid']}
            aria-describedby={props['aria-describedby']}
            className={cn(
              'flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card py-2 pr-10 pl-3.5 text-left text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=open]:border-ring md:text-sm',
            )}
          >
            {!props.multiple && selectedOptions[0]?.leading ? (
              <span className="shrink-0">{selectedOptions[0].leading}</span>
            ) : null}
            <span
              className={cn('min-w-0 flex-1 truncate', !triggerLabel && 'text-muted-foreground/75')}
            >
              {triggerLabel ?? placeholder ?? t('common.select')}
            </span>
          </button>
        </PopoverTrigger>
        {props.clearable && selectedValues.length > 0 && !disabled ? (
          <button
            type="button"
            aria-label={t('common.clear')}
            onClick={() => (props.multiple ? props.onChange([]) : props.onChange(null))}
            className="absolute top-1/2 right-8 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
        <ChevronsUpDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveTo(activeIndex + 1);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveTo(activeIndex - 1);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const option = filtered[activeIndex];
                if (option) choose(option);
              }
            }}
            placeholder={searchPlaceholder ?? t('common.searchPlaceholder')}
            aria-label={searchPlaceholder ?? t('common.search')}
            aria-controls={listId}
            aria-activedescendant={filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/75 md:text-sm"
          />
          {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </div>
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-multiselectable={props.multiple || undefined}
          className="max-h-72 overflow-y-auto p-1.5"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {loading ? t('common.loading') : (emptyText ?? t('common.noResults'))}
            </li>
          ) : (
            filtered.map((option, index) => {
              const selected = selectedValues.includes(option.value);
              return (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={option.disabled || undefined}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm select-none sm:min-h-10',
                    index === activeIndex && 'bg-muted',
                    option.disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {option.leading ? <span className="shrink-0">{option.leading}</span> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  <Check
                    aria-hidden
                    className={cn('size-4 shrink-0 text-primary', !selected && 'invisible')}
                  />
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
