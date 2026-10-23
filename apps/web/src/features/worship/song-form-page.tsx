import {
  HYMNALS,
  HYMNAL_LABELS,
  SONG_KEYS,
  WORSHIP_LIMITS,
  localize,
  songInputSchema,
  type Song,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ListMusic, X } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { songQuery, useSaveSong } from './api';
import { WORSHIP_TONE } from './worship-lib';

type FormInput = z.input<typeof songInputSchema>;
type FormOutput = z.output<typeof songInputSchema>;

export function NewSongPage() {
  return <SongFormPage />;
}

export function EditSongPage() {
  const { songId = '' } = useParams();
  const { churchId } = useChurch();
  const query = useQuery(songQuery(churchId, songId));
  if (query.isPending) {
    return (
      <Page size="narrow">
        <SkeletonText lines={10} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page size="narrow">
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      </Page>
    );
  }
  return <SongFormPage song={query.data.song} />;
}

function SongFormPage({ song }: { song?: Song }) {
  const { churchId, base } = useChurch();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(songInputSchema),
    defaultValues: {
      title: song?.title ?? '',
      author: song?.author ?? '',
      defaultKey: song?.defaultKey ?? '',
      tempo: song?.tempo ?? null,
      lyrics: song?.lyrics ?? '',
      tags: song?.tags ?? [],
      ccliNumber: song?.ccliNumber ?? '',
      hymnal: song?.hymnal ?? null,
      hymnalNumber: song?.hymnalNumber ?? '',
      notes: song?.notes ?? '',
      isActive: song?.isActive ?? true,
    },
  });
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful);
  const save = useMutationToast(useSaveSong(churchId, song?.id), {
    success: (result) => t('worship.songSaved', { title: result.song.title }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (result) void navigate(`${base}/worship/songs/${result.song.id}`, { replace: !song });
  });
  const title = song ? t('worship.songFormEdit') : t('worship.songFormNew');

  return (
    <Page size="narrow">
      <PageHeader
        title={title}
        icon={ListMusic}
        tone={WORSHIP_TONE}
        breadcrumbs={[
          { label: t('worship.nav'), to: `${base}/worship` },
          { label: t('worship.songsTitle'), to: `${base}/worship/songs` },
          ...(song ? [{ label: song.title, to: `${base}/worship/songs/${song.id}` }] : []),
          { label: title },
        ]}
      />
      <Card>
        <CardContent>
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
            <Field
              label={t('worship.fieldSongTitle')}
              htmlFor="song-title"
              error={errors.title?.message}
              required
            >
              <Input
                id="song-title"
                autoFocus
                aria-invalid={!!errors.title}
                {...form.register('title')}
              />
            </Field>
            <Field
              label={t('worship.fieldAuthor')}
              htmlFor="song-author"
              error={errors.author?.message}
            >
              <Input id="song-author" {...form.register('author')} />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <Controller
                control={form.control}
                name="hymnal"
                render={({ field }) => (
                  <Field label={t('worship.fieldHymnal')} htmlFor="song-hymnal">
                    <Select
                      id="song-hymnal"
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value || null)}
                    >
                      <option value="">{t('worship.noHymnal')}</option>
                      {HYMNALS.map((hymnal) => (
                        <option key={hymnal} value={hymnal}>
                          {localize(HYMNAL_LABELS[hymnal], locale)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              />
              <Field
                label={t('worship.fieldHymnalNumber')}
                htmlFor="song-number"
                error={errors.hymnalNumber?.message}
              >
                <Input id="song-number" inputMode="numeric" {...form.register('hymnalNumber')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label={t('worship.fieldKey')} htmlFor="song-key">
                <Select id="song-key" {...form.register('defaultKey')}>
                  <option value="">{t('worship.anyKey')}</option>
                  {SONG_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t('worship.fieldTempo')}
                htmlFor="song-tempo"
                error={errors.tempo?.message}
              >
                <Input
                  id="song-tempo"
                  type="number"
                  inputMode="numeric"
                  min={20}
                  max={300}
                  aria-invalid={!!errors.tempo}
                  {...form.register('tempo', {
                    setValueAs: (value: string) =>
                      value === '' || value === null ? null : Number(value),
                  })}
                />
              </Field>
              <Field
                label={t('worship.fieldCcli')}
                htmlFor="song-ccli"
                error={errors.ccliNumber?.message}
                className="col-span-2 sm:col-span-1"
              >
                <Input id="song-ccli" inputMode="numeric" {...form.register('ccliNumber')} />
              </Field>
            </div>
            <Controller
              control={form.control}
              name="tags"
              render={({ field }) => (
                <TagsField
                  value={field.value ?? []}
                  onChange={field.onChange}
                  error={errors.tags?.message}
                />
              )}
            />
            <Field
              label={t('worship.fieldLyrics')}
              htmlFor="song-lyrics"
              error={errors.lyrics?.message}
            >
              <Textarea
                id="song-lyrics"
                rows={10}
                placeholder={t('worship.lyricsPlaceholder')}
                className="font-serif leading-relaxed"
                {...form.register('lyrics')}
              />
            </Field>
            <Field
              label={t('worship.fieldSongNotes')}
              htmlFor="song-notes"
              error={errors.notes?.message}
            >
              <Textarea id="song-notes" rows={2} {...form.register('notes')} />
            </Field>
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3.5">
                  <div>
                    <Label htmlFor="song-active">{t('worship.fieldActive')}</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('worship.fieldActiveHint')}
                    </p>
                  </div>
                  <Switch
                    id="song-active"
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => void navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={save.isPending}>
                {song ? t('common.saveChanges') : t('worship.newSong')}
              </Button>
            </FormActions>
            {guard}
          </form>
        </CardContent>
      </Card>
    </Page>
  );
}

/** Tags as chips; Enter or comma adds the typed tag. */
function TagsField({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const add = () => {
    const tag = text.trim().toLowerCase().slice(0, 40);
    if (tag && !value.includes(tag) && value.length < WORSHIP_LIMITS.songTagsMax)
      onChange([...value, tag]);
    setText('');
  };
  return (
    <Field label={t('worship.fieldTags')} htmlFor="song-tags" error={error}>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
        {value.map((tag) => (
          <span
            key={tag}
            data-tone={WORSHIP_TONE}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-tone-soft pr-1 pl-2 text-sm font-medium text-tone-ink"
          >
            {tag}
            <button
              type="button"
              aria-label={t('worship.removeTag', { tag })}
              onClick={() => onChange(value.filter((item) => item !== tag))}
              className="flex size-6 items-center justify-center rounded hover:bg-card/60"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id="song-tags"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            } else if (event.key === 'Backspace' && !text && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={add}
          placeholder={value.length === 0 ? t('worship.tagsPlaceholder') : undefined}
          className="h-8 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground/75 md:text-sm"
        />
      </div>
    </Field>
  );
}
