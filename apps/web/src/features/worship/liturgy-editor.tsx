import {
  LITURGY_ITEM_TYPES,
  SONG_KEYS,
  SONG_REST_WEEKS,
  fullName,
  liturgyItemInputSchema,
  liturgyTotalMinutes,
  songRecentlyUsed,
  type LiturgyItem,
  type LiturgyItemType,
  type PersonSummary,
  type Song,
  type WorshipService,
  worshipServiceDetailSchema,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Copy,
  GripVertical,
  ListOrdered,
  Pencil,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { RowActions } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage, request } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { servicesQuery, songQuery, songsQuery, useSaveLiturgy } from './api';
import { PersonSelect } from './worship-ui';
import {
  LITURGY_TYPE_STYLE,
  liturgySchedule,
  WORSHIP_TONE,
  hymnalLabel,
  useDuration,
  useLiturgyTypeLabel,
} from './worship-lib';

/** A liturgy item while it is edited; `key` is local and stable across reorders. */
type Draft = {
  key: string;
  type: LiturgyItemType;
  title: string;
  durationMinutes: number | null;
  songId: string | null;
  songTitle: string | null;
  songKey: string | null;
  personId: string | null;
  person: PersonSummary | null;
  personName: string | null;
  notes: string | null;
};

let sequence = 0;
const nextKey = () => `item-${(sequence += 1)}`;

const toDraft = (item: LiturgyItem): Draft => ({
  key: nextKey(),
  type: item.type,
  title: item.title,
  durationMinutes: item.durationMinutes,
  songId: item.songId,
  songTitle: item.songTitle,
  songKey: item.songKey,
  personId: item.person?.id ?? null,
  person: item.person,
  personName: item.personName,
  notes: item.notes,
});

/** What is saved; used to tell whether the editor differs from the server. */
const toInput = (item: Draft) => ({
  type: item.type,
  title: item.title,
  durationMinutes: item.durationMinutes,
  songId: item.type === 'song' ? item.songId : null,
  songKey: item.type === 'song' ? item.songKey : null,
  personId: item.personId,
  personName: item.personId ? null : item.personName,
  notes: item.notes,
});

const sameList = (a: Draft[], b: Draft[]) =>
  JSON.stringify(a.map(toInput)) === JSON.stringify(b.map(toInput));

/** The usual Reformed order of worship (GKI, HKBP, GPIB), with typical lengths. */
const TEMPLATE: { type: LiturgyItemType; minutes: number }[] = [
  { type: 'prayer', minutes: 3 },
  { type: 'song', minutes: 5 },
  { type: 'prayer', minutes: 4 },
  { type: 'reading', minutes: 2 },
  { type: 'reading', minutes: 6 },
  { type: 'sermon', minutes: 30 },
  { type: 'other', minutes: 3 },
  { type: 'prayer', minutes: 6 },
  { type: 'offering', minutes: 8 },
  { type: 'announcement', minutes: 5 },
  { type: 'song', minutes: 4 },
  { type: 'prayer', minutes: 2 },
];

/**
 * The order of worship. Planners reorder by dragging the handle (mouse or touch) or with the
 * row menu and arrow keys, edit items in a sheet, and save the whole list at once.
 */
export function LiturgyEditor({
  service,
  items,
  canManage,
}: {
  service: WorshipService;
  items: LiturgyItem[];
  canManage: boolean;
}) {
  const { churchId } = useChurch();
  const { t, formatTime } = useI18n();
  const duration = useDuration();
  const typeLabel = useLiturgyTypeLabel();
  const [synced, setSynced] = useState(items);
  const [saved, setSaved] = useState(() => items.map(toDraft));
  const [draft, setDraft] = useState(saved);
  const [editing, setEditing] = useState<Draft | 'new' | null>(null);
  const [copying, setCopying] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const dirty = !sameList(draft, saved);

  // Fresh server data (after a save, or edited elsewhere) replaces an untouched editor.
  if (items !== synced) {
    setSynced(items);
    const next = items.map(toDraft);
    setSaved(next);
    if (!dirty) setDraft(next);
  }

  const guard = useUnsavedChangesGuard(canManage && dirty);
  const save = useMutationToast(useSaveLiturgy(churchId, service.id), {
    success: t('worship.liturgySaved'),
  });

  const move = (from: number, to: number) =>
    setDraft((list) => {
      if (to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    });

  /**
   * Pointer drag on the handle (mouse, pen or touch): while a row is held, it moves over the
   * midpoints of the other rows. Window listeners keep working when the row moves in the DOM.
   */
  useEffect(() => {
    if (dragging === null) return;
    const onMove = (event: globalThis.PointerEvent) => {
      if (!listRef.current) return;
      const rows = [...listRef.current.children] as HTMLElement[];
      let target = 0;
      rows.forEach((row, index) => {
        if (index === dragging) return;
        const rect = row.getBoundingClientRect();
        if (event.clientY > rect.top + rect.height / 2) target += 1;
      });
      if (target === dragging) return;
      setDraft((list) => {
        const next = [...list];
        const [item] = next.splice(dragging, 1);
        if (item) next.splice(target, 0, item);
        return next;
      });
      setDragging(target);
    };
    const stop = () => setDragging(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging]);

  const start = new Date(service.startsAt).getTime();
  const times = liturgySchedule(service.startsAt, draft).map((entry) => entry.at);
  const total = liturgyTotalMinutes(draft);

  const applyTemplate = () => {
    const titles = t('worship.templateItems').split('|');
    setDraft(
      TEMPLATE.map((entry, index) => ({
        key: nextKey(),
        type: entry.type,
        title: titles[index] ?? typeLabel(entry.type),
        durationMinutes: entry.minutes,
        songId: null,
        songTitle: null,
        songKey: null,
        personId: null,
        person: null,
        personName: null,
        notes: null,
      })),
    );
  };

  const commit = (item: Draft) =>
    setDraft((list) =>
      list.some((entry) => entry.key === item.key)
        ? list.map((entry) => (entry.key === item.key ? item : entry))
        : [...list, item],
    );

  if (draft.length === 0 && !dirty) {
    return (
      <>
        <EmptyState
          icon={ListOrdered}
          tone={WORSHIP_TONE}
          title={t('worship.liturgyEmpty')}
          description={canManage ? t('worship.liturgyEmptyManage') : t('worship.liturgyEmptyView')}
          action={
            canManage ? (
              <Button onClick={applyTemplate}>
                <ListOrdered />
                {t('worship.useTemplate')}
              </Button>
            ) : null
          }
          secondaryAction={
            canManage ? (
              <>
                <Button variant="outline" onClick={() => setEditing('new')}>
                  <Plus />
                  {t('worship.addItem')}
                </Button>
                <Button variant="ghost" onClick={() => setCopying(true)}>
                  <Copy />
                  {t('worship.copyLiturgy')}
                </Button>
              </>
            ) : null
          }
        />
        <ItemSheet
          service={service}
          item={editing}
          onClose={() => setEditing(null)}
          onApply={commit}
        />
        <CopyLiturgyDialog
          service={service}
          open={copying}
          onOpenChange={setCopying}
          onCopy={(copied) => setDraft(copied)}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4" aria-hidden />
          <span className="font-medium text-foreground tabular">
            {t('worship.totalDuration', { duration: duration(total) })}
          </span>
          {total > 0 ? (
            <span className="tabular">
              · {t('worship.endsAround', { time: formatTime(new Date(start + total * 60_000)) })}
            </span>
          ) : null}
        </p>
        {canManage ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('worship.copyLiturgy')}
              onClick={() => setCopying(true)}
            >
              <Copy />
              <span className="hidden sm:inline">{t('worship.copyLiturgy')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
              <Plus />
              {t('worship.addItem')}
            </Button>
          </div>
        ) : null}
      </div>

      <ol
        ref={listRef}
        className={cn(
          'divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft',
          dragging !== null && 'cursor-grabbing select-none',
        )}
      >
        {draft.map((item, index) => {
          const style = LITURGY_TYPE_STYLE[item.type];
          const leader = item.person ? fullName(item.person) : item.personName;
          return (
            <li
              key={item.key}
              className={cn(
                'flex min-w-0 items-center gap-2 py-2.5 pr-2 pl-2 transition-[background-color,box-shadow] duration-150 sm:gap-3 sm:pl-3',
                dragging === index && 'relative z-10 bg-muted/70 shadow-raised',
              )}
            >
              {canManage ? (
                <button
                  type="button"
                  data-handle={item.key}
                  aria-label={t('worship.dragToReorder', { title: item.title })}
                  className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/30 active:cursor-grabbing sm:size-9"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setDragging(index);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                      event.preventDefault();
                      const to = index + (event.key === 'ArrowUp' ? -1 : 1);
                      move(index, to);
                      requestAnimationFrame(() =>
                        listRef.current
                          ?.querySelector<HTMLButtonElement>(`[data-handle="${item.key}"]`)
                          ?.focus(),
                      );
                    }
                  }}
                >
                  <GripVertical className="size-4" />
                </button>
              ) : null}
              <span className="hidden w-12 shrink-0 text-xs text-muted-foreground tabular sm:block">
                {formatTime(times[index])}
              </span>
              <ToneIcon icon={style.icon} tone={style.tone} size="sm" />
              <button
                type="button"
                disabled={!canManage}
                onClick={() => setEditing(item)}
                className="min-w-0 flex-1 rounded-md py-0.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-default"
              >
                <span className="line-clamp-2 font-medium sm:line-clamp-1">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  <span className="tabular sm:hidden">
                    {formatTime(times[index])}
                    {item.durationMinutes
                      ? ` · ${t('worship.minutes', { count: item.durationMinutes })}`
                      : ''}
                    {' · '}
                  </span>
                  {[
                    typeLabel(item.type),
                    item.type === 'song' && item.songTitle && item.songTitle !== item.title
                      ? item.songTitle
                      : null,
                    item.songKey ? `${t('worship.key')} ${item.songKey}` : null,
                    leader,
                    item.notes,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
              {item.durationMinutes ? (
                <span className="hidden shrink-0 text-xs text-muted-foreground tabular sm:inline">
                  {t('worship.minutes', { count: item.durationMinutes })}
                </span>
              ) : null}
              {canManage ? (
                <RowActions
                  label={item.title}
                  actions={[
                    {
                      id: 'edit',
                      label: t('worship.editItem'),
                      icon: Pencil,
                      onSelect: () => setEditing(item),
                    },
                    {
                      id: 'up',
                      label: t('worship.moveUp', { title: item.title }),
                      icon: ArrowUp,
                      hidden: index === 0,
                      onSelect: () => move(index, index - 1),
                    },
                    {
                      id: 'down',
                      label: t('worship.moveDown', { title: item.title }),
                      icon: ArrowDown,
                      hidden: index === draft.length - 1,
                      onSelect: () => move(index, index + 1),
                    },
                    {
                      id: 'remove',
                      label: t('worship.removeItem', { title: item.title }),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () =>
                        setDraft((list) => list.filter((entry) => entry.key !== item.key)),
                    },
                  ]}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {canManage && dirty ? (
        <div
          data-print="hide"
          className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-20 flex animate-rise-in flex-col gap-2 rounded-xl border border-primary/25 bg-card/95 p-3 shadow-raised backdrop-blur sm:flex-row sm:items-center sm:justify-between md:bottom-4"
        >
          <p className="text-sm font-medium">{t('worship.unsavedLiturgy')}</p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(saved)}
              disabled={save.isPending}
            >
              {t('worship.discardChanges')}
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() => void save.run({ items: draft.map(toInput) })}
            >
              {!save.isPending ? <Save /> : null}
              {t('worship.saveLiturgy')}
            </Button>
          </div>
        </div>
      ) : null}

      <ItemSheet
        service={service}
        item={editing}
        onClose={() => setEditing(null)}
        onApply={commit}
      />
      <CopyLiturgyDialog
        service={service}
        open={copying}
        onOpenChange={setCopying}
        onCopy={(copied) => setDraft(copied)}
      />
      {guard}
    </div>
  );
}

type ItemForm = z.input<typeof liturgyItemInputSchema>;

/** Adds or edits one item; songs come from the library with a "sung recently" warning. */
function ItemSheet({
  service,
  item,
  onClose,
  onApply,
}: {
  service: WorshipService;
  item: Draft | 'new' | null;
  onClose: () => void;
  onApply: (item: Draft) => void;
}) {
  const { t } = useI18n();
  const open = item !== null;
  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <SheetContent>
        {item ? (
          <ItemFormBody
            key={item === 'new' ? 'new' : item.key}
            service={service}
            item={item === 'new' ? null : item}
            onCancel={onClose}
            onApply={(draft) => {
              onApply(draft);
              onClose();
            }}
          />
        ) : (
          <SheetHeader>
            <SheetTitle>{t('worship.newItem')}</SheetTitle>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ItemFormBody({
  service,
  item,
  onCancel,
  onApply,
}: {
  service: WorshipService;
  item: Draft | null;
  onCancel: () => void;
  onApply: (item: Draft) => void;
}) {
  const { churchId } = useChurch();
  const { t, formatDate } = useI18n();
  const typeLabel = useLiturgyTypeLabel();
  const [song, setSong] = useState<Pick<Song, 'id' | 'title'> | null>(
    item?.songId ? { id: item.songId, title: item.songTitle ?? item.title } : null,
  );
  // The song's other services (before or after this one) tell whether it repeats too soon.
  const history = useQuery({ ...songQuery(churchId, song?.id ?? ''), enabled: !!song });
  const [person, setPerson] = useState<PersonSummary | null>(item?.person ?? null);
  const form = useForm<ItemForm, unknown, z.output<typeof liturgyItemInputSchema>>({
    resolver: zodResolver(liturgyItemInputSchema),
    defaultValues: {
      type: item?.type ?? 'song',
      title: item?.title ?? '',
      durationMinutes: item?.durationMinutes ?? null,
      songId: item?.songId ?? null,
      songKey: item?.songKey ?? '',
      personId: item?.personId ?? null,
      personName: item?.personName ?? '',
      notes: item?.notes ?? '',
    },
  });
  const errors = form.formState.errors;
  const type = useWatch({ control: form.control, name: 'type' });
  const personId = useWatch({ control: form.control, name: 'personId' });

  const submit = form.handleSubmit((values) => {
    onApply({
      key: item?.key ?? nextKey(),
      type: values.type,
      title: values.title,
      durationMinutes: values.durationMinutes,
      songId: values.type === 'song' ? values.songId : null,
      songTitle: values.type === 'song' ? (song?.title ?? null) : null,
      songKey: values.type === 'song' ? values.songKey : null,
      personId: values.personId,
      person: values.personId ? person : null,
      personName: values.personId ? null : values.personName,
      notes: values.notes,
    });
  });

  const near = song && history.data ? nearestOtherUse(history.data.usage, service) : null;

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex min-h-0 flex-1 flex-col gap-4"
      noValidate
    >
      <SheetHeader>
        <SheetTitle>{item ? t('worship.editItem') : t('worship.newItem')}</SheetTitle>
        <SheetDescription>{service.title}</SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <Field label={t('worship.itemType')} htmlFor="item-type">
            <Select id="item-type" {...form.register('type')}>
              {LITURGY_ITEM_TYPES.map((value) => (
                <option key={value} value={value}>
                  {typeLabel(value)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t('worship.itemDuration')}
            htmlFor="item-duration"
            error={errors.durationMinutes?.message}
          >
            <Input
              id="item-duration"
              type="number"
              inputMode="numeric"
              min={0}
              max={600}
              {...form.register('durationMinutes', {
                setValueAs: (value: string) =>
                  value === '' || value === null ? null : Number(value),
              })}
              aria-invalid={!!errors.durationMinutes}
            />
          </Field>
        </div>
        {type === 'song' ? (
          <>
            <Controller
              control={form.control}
              name="songId"
              render={({ field }) => (
                <Field label={t('worship.itemSong')} htmlFor="item-song">
                  <SongSelect
                    id="item-song"
                    value={field.value ?? null}
                    selected={song}
                    referenceDate={service.startsAt}
                    onChange={(next) => {
                      const previous = song?.title;
                      setSong(next);
                      field.onChange(next?.id ?? null);
                      const title = form.getValues('title');
                      if (next && (!title || title === previous)) {
                        form.setValue('title', next.title, { shouldValidate: true });
                      }
                      if (next?.defaultKey && !form.getValues('songKey')) {
                        form.setValue('songKey', next.defaultKey);
                      }
                    }}
                  />
                </Field>
              )}
            />
            {near ? (
              <StatusBadge tone="warning" icon={TriangleAlert} className="-mt-2 whitespace-normal">
                {t('worship.restWarningNear', {
                  weeks: SONG_REST_WEEKS,
                  title: near.title,
                  date: formatDate(near.startsAt, 'dayMonth'),
                })}
              </StatusBadge>
            ) : null}
          </>
        ) : null}
        <Field
          label={t('worship.itemTitle')}
          htmlFor="item-title"
          error={errors.title?.message}
          required
        >
          <Input
            id="item-title"
            autoFocus
            aria-invalid={!!errors.title}
            {...form.register('title')}
          />
        </Field>
        {type === 'song' ? (
          <Field label={t('worship.itemKey')} htmlFor="item-key">
            <Select id="item-key" {...form.register('songKey')}>
              <option value="">{t('worship.anyKey')}</option>
              {SONG_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">{t('worship.itemLeader')}</legend>
          <Controller
            control={form.control}
            name="personId"
            render={({ field }) => (
              <PersonSelect
                id="item-person"
                value={field.value ?? null}
                initial={person}
                placeholder={t('worship.itemLeaderPerson')}
                onChange={(personId, chosen) => {
                  setPerson(chosen);
                  field.onChange(personId);
                }}
              />
            )}
          />
          {!personId ? (
            <Input
              aria-label={t('worship.itemLeaderName')}
              placeholder={t('worship.itemLeaderNamePlaceholder')}
              {...form.register('personName')}
            />
          ) : null}
        </fieldset>
        <Field label={t('worship.itemNotes')} htmlFor="item-notes" error={errors.notes?.message}>
          <Textarea id="item-notes" rows={2} {...form.register('notes')} />
        </Field>
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit">{t('worship.saveItem')}</Button>
      </SheetFooter>
    </form>
  );
}

/** The closest other service using a song within the rest weeks of this one, if any. */
const nearestOtherUse = (
  usage: readonly { serviceId: string; title: string; startsAt: string }[],
  service: Pick<WorshipService, 'id' | 'startsAt'>,
) => {
  const at = new Date(service.startsAt).getTime();
  const gap = (item: { startsAt: string }) => Math.abs(new Date(item.startsAt).getTime() - at);
  return (
    usage
      .filter(
        (item) => item.serviceId !== service.id && gap(item) < SONG_REST_WEEKS * 7 * 86_400_000,
      )
      .sort((a, b) => gap(a) - gap(b))[0] ?? null
  );
};

/** Songs from the library, searched on the server, with hymnal number and last use. */
export function SongSelect({
  id,
  value,
  selected,
  referenceDate,
  onChange,
}: {
  id?: string;
  value: string | null;
  selected: Pick<Song, 'id' | 'title'> | null;
  referenceDate: string;
  onChange: (song: Song | null) => void;
}) {
  const { churchId } = useChurch();
  const { t, formatRelative } = useI18n();
  const [search, setSearch] = useState('');
  const query = useQuery(songsQuery(churchId, { q: search || undefined, limit: 30 }));
  const songs = query.data?.items ?? [];
  const options = [
    ...(selected && !songs.some((song) => song.id === selected.id)
      ? [{ value: selected.id, label: selected.title }]
      : []),
    ...songs.map((song) => {
      const recent = songRecentlyUsed(song.lastUsedAt, referenceDate);
      return {
        value: song.id,
        label: song.title,
        description: [
          hymnalLabel(song),
          song.lastUsedAt
            ? t('worship.songUsedRecently', { when: formatRelative(song.lastUsedAt) })
            : t('worship.songNeverUsed'),
          recent ? '⚠' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }),
  ];
  return (
    <Combobox
      id={id}
      value={value}
      clearable
      placeholder={t('worship.itemSongPlaceholder')}
      onSearchChange={setSearch}
      loading={query.isFetching}
      options={options}
      onChange={(next) => onChange(songs.find((song) => song.id === next) ?? null)}
    />
  );
}

/** Picks another service and loads its liturgy into the editor. */
function CopyLiturgyDialog({
  service,
  open,
  onOpenChange,
  onCopy,
}: {
  service: WorshipService;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopy: (items: Draft[]) => void;
}) {
  const { churchId } = useChurch();
  const { t, formatDate } = useI18n();
  const duration = useDuration();
  const [loading, setLoading] = useState<string | null>(null);
  const query = useQuery({
    ...servicesQuery(churchId, { scope: 'all', limit: 50 }),
    enabled: open,
  });
  const candidates = (query.data?.items ?? []).filter(
    (item) => item.id !== service.id && item.totalMinutes > 0,
  );
  const copy = async (id: string) => {
    setLoading(id);
    try {
      const detail = await request(worshipServiceDetailSchema, {
        url: `/churches/${churchId}/worship/services/${id}`,
      });
      onCopy(detail.liturgy.map(toDraft));
      toast.success(t('worship.liturgyCopied', { count: detail.liturgy.length }));
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('worship.copyLiturgyTitle')}</DialogTitle>
          <DialogDescription>{t('worship.copyLiturgyBody')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[50dvh] min-h-32">
          {query.isPending ? (
            <SkeletonList rows={4} avatar={false} />
          ) : query.isError ? (
            <ErrorState
              compact
              message={getErrorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : candidates.length === 0 ? (
            <EmptyState
              compact
              icon={ListOrdered}
              tone={WORSHIP_TONE}
              title={t('worship.copyLiturgyEmpty')}
            />
          ) : (
            <ul className="flex flex-col gap-1">
              {candidates.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => void copy(item.id)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatDate(item.startsAt, 'dateShort')} · {duration(item.totalMinutes)}
                      </span>
                    </span>
                    {loading === item.id ? (
                      <Clock className="size-4 animate-spin" aria-hidden />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
