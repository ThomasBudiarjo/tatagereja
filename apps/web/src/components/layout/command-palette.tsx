import { can, fullName } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, Loader2, Search } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { useNavigate } from 'react-router';
import { EntityAvatar } from '@/components/ui/avatar';
import { Kbd } from '@/components/ui/kbd';
import { ToneIcon } from '@/components/ui/status-badge';
import type { Tone } from '@/components/ui/tone';
import { peopleListQuery } from '@/features/people/api';
import { useModuleMenu } from '@/features/registry';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useDebounced } from '@/lib/use-debounced';
import { cn } from '@/lib/utils';
import { useCommandPalette } from '@/stores/command-palette';

type Result = {
  id: string;
  group: 'actions' | 'pages' | 'people';
  label: string;
  description?: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  avatar?: { name: string; src: string | null };
};

const GROUP_LABELS: Record<Result['group'], MessageKey> = {
  actions: 'common.commandActions',
  pages: 'common.commandPages',
  people: 'common.commandPeople',
};

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/** 0 = no match; higher is better (a label that starts with the query wins). */
const score = (query: string, label: string, extra: string[]) => {
  const needle = normalize(query);
  const haystack = normalize(label);
  if (haystack.startsWith(needle)) return 3;
  if (haystack.split(/\s+/).some((word) => word.startsWith(needle))) return 2;
  if (haystack.includes(needle)) return 1;
  // Keywords and descriptions only count from three letters, so short queries stay precise.
  if (needle.length >= 3 && extra.some((word) => normalize(word).includes(needle))) return 1;
  return 0;
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * Global search (Ctrl/⌘ K, or "/"): menu destinations and actions the caller may use, and
 * people from the directory when they may view it.
 */
export function CommandPalette() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const open = useCommandPalette((state) => state.open);
  const setOpen = useCommandPalette((state) => state.setOpen);
  const toggle = useCommandPalette((state) => state.toggle);
  const { items, commands, quickActions, context } = useModuleMenu();
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const debounced = useDebounced(query.trim(), 250);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggle();
      } else if (event.key === '/' && !isTyping(event.target) && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle, setOpen]);

  const searchPeople = can.viewDirectory(context.access) && debounced.length >= 2;
  const people = useQuery({
    ...peopleListQuery(context.churchId, { q: debounced, limit: 6 }),
    enabled: open && searchPeople,
  });

  const results = React.useMemo(() => {
    const q = query.trim();
    const actionResults: Result[] = [];
    const seen = new Set<string>();
    for (const action of [...quickActions, ...commands]) {
      if (seen.has(action.href)) continue;
      seen.add(action.href);
      actionResults.push({
        id: `action-${action.moduleId}-${action.id}`,
        group: 'actions',
        label: t(action.labelKey),
        href: action.href,
        icon: action.icon,
        tone: action.tone,
      });
    }
    const pageResults: Result[] = items.map((item) => ({
      id: `page-${item.moduleId}-${item.id}`,
      group: 'pages',
      label: t(item.labelKey),
      description: item.descriptionKey ? t(item.descriptionKey) : undefined,
      href: item.href,
      icon: item.icon,
      tone: item.tone,
    }));
    const keywordsFor = (result: Result) => {
      const source =
        result.group === 'pages'
          ? items.find((item) => item.href === result.href)?.keywords
          : commands.find((command) => command.href === result.href)?.keywords;
      return [...(source ?? []), result.description ?? ''];
    };
    const rank = (list: Result[]) =>
      q
        ? list
            .map((result) => ({ result, score: score(q, result.label, keywordsFor(result)) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.result)
        : list;
    const personResults: Result[] =
      searchPeople && people.data
        ? people.data.items.map((person) => ({
            id: `person-${person.id}`,
            group: 'people',
            label: fullName(person),
            description: [person.phone, person.email].filter(Boolean).join(' · ') || undefined,
            href: `${context.base}/people/${person.id}`,
            avatar: { name: fullName(person), src: person.photoUrl },
          }))
        : [];
    return [...rank(actionResults).slice(0, q ? 5 : 4), ...rank(pageResults), ...personResults];
  }, [query, items, commands, quickActions, people.data, searchPeople, context.base, t]);

  const go = (result: Result | undefined) => {
    if (!result) return;
    setOpen(false);
    navigate(result.href);
  };

  const moveTo = (index: number) => {
    const next = (index + results.length) % Math.max(1, results.length);
    setActive(next);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
          setActive(0);
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 top-0 z-50 flex max-h-dvh flex-col overflow-hidden bg-popover shadow-overlay outline-none safe-top data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 max-sm:h-dvh sm:top-[12vh] sm:mx-auto sm:max-h-[70vh] sm:w-full sm:max-w-xl sm:rounded-2xl sm:border"
        >
          <DialogPrimitive.Title className="sr-only">
            {t('common.commandOpen')}
          </DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveTo(active + 1);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveTo(active - 1);
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  go(results[active]);
                }
              }}
              placeholder={t('common.commandPlaceholder')}
              aria-label={t('common.commandPlaceholder')}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/75"
            />
            {people.isFetching && searchPeople ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : null}
            <DialogPrimitive.Close className="rounded-md px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden">
              {t('common.cancel')}
            </DialogPrimitive.Close>
            <Kbd className="hidden sm:inline-flex">Esc</Kbd>
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="min-h-0 flex-1 overflow-y-auto p-2"
          >
            {results.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                {t('common.commandEmpty', { query: query.trim() })}
              </p>
            ) : (
              results.map((result, index) => {
                const header =
                  index === 0 || results[index - 1]?.group !== result.group
                    ? GROUP_LABELS[result.group]
                    : null;
                return (
                  <React.Fragment key={result.id}>
                    {header ? (
                      <p
                        className="px-2.5 pt-3 pb-1.5 text-overline text-muted-foreground first:pt-1"
                        role="presentation"
                      >
                        {t(header)}
                      </p>
                    ) : null}
                    <div
                      id={`${listId}-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={index === active}
                      onMouseMove={() => setActive(index)}
                      onClick={() => go(result)}
                      className={cn(
                        'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors',
                        index === active && 'bg-muted',
                      )}
                    >
                      {result.avatar ? (
                        <EntityAvatar name={result.avatar.name} src={result.avatar.src} size="sm" />
                      ) : result.icon ? (
                        <ToneIcon icon={result.icon} tone={result.tone} size="sm" />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{result.label}</span>
                        {result.description ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {result.description}
                          </span>
                        ) : null}
                      </span>
                      {index === active ? (
                        <CornerDownLeft
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                  </React.Fragment>
                );
              })
            )}
          </div>
          <p className="hidden border-t px-4 py-2.5 text-xs text-muted-foreground sm:block">
            {t('common.commandHint')}
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
