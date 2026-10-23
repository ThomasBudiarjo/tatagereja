import {
  BULLETIN_PICKABLE_KINDS,
  BULLETIN_SECTION_KINDS,
  BULLETIN_SECTION_LABELS,
  bulletinInputSchema,
  defaultBulletinSections,
  localize,
  type Bulletin,
  type BulletinInput,
  type BulletinSectionKind,
  type BulletinSources,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, FilePlus2, Newspaper, Plus, Trash2 } from 'lucide-react';
import { Controller, useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import type { z } from 'zod';
import { useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FormActions } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Skeleton, SkeletonPage } from '@/components/ui/skeleton';
import { ToneIcon } from '@/components/ui/status-badge';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { churchToday } from '@/features/comms/church-time';
import { useServerErrors } from '@/features/comms/forms';
import { MarkdownEditor } from '@/features/comms/markdown';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useDebounced } from '@/lib/use-debounced';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { bulletinQuery, bulletinSourcesQuery, useSaveBulletin } from './api';
import {
  BULLETIN_TONE,
  SECTION_ICONS,
  SECTION_TONES,
  newSectionId,
  nextSunday,
} from './bulletin-lib';

type FormInput = z.input<typeof bulletinInputSchema>;

export function NewBulletinPage() {
  return <BulletinEditor />;
}

export function EditBulletinPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const query = useQuery(bulletinQuery(churchId, id));
  if (query.isPending) return <SkeletonPage />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('comms.bulletinEdit')} backTo={`${base}/bulletins`} />
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </Page>
    );
  }
  if (!query.data.canManage) return <NoAccessState />;
  return <BulletinEditor bulletin={query.data.bulletin} />;
}

/**
 * Composing the Warta Jemaat: free text sections and generated ones (services, rosters,
 * announcements, events, birthdays, anniversaries, the offering summary), in any order.
 * Generated sections take this week's data when read; editors may pick items instead.
 */
function BulletinEditor({ bulletin }: { bulletin?: Bulletin }) {
  const { churchId, base } = useChurch();
  const { t, locale, timeZone, formatDate } = useI18n();
  const navigate = useNavigate();
  const form = useForm<FormInput, unknown, BulletinInput>({
    resolver: zodResolver(bulletinInputSchema),
    defaultValues: {
      title: bulletin?.title ?? t('comms.bulletinDefaultTitle'),
      issueDate: bulletin?.issueDate ?? nextSunday(churchToday(timeZone)),
      theme: bulletin?.theme ?? '',
      coverImageUrl: bulletin?.coverImageUrl ?? '',
      sections: bulletin?.sections ?? defaultBulletinSections(locale, newSectionId),
    },
  });
  const sections = useFieldArray({ control: form.control, name: 'sections', keyName: 'key' });
  const serverErrors = useServerErrors(form);
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful);
  const issueDate = useWatch({ control: form.control, name: 'issueDate' });
  const debouncedDate = useDebounced(issueDate ?? '', 400);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(debouncedDate);
  const sources = useQuery({
    ...bulletinSourcesQuery(churchId, debouncedDate),
    enabled: validDate,
  });
  const save = useMutationToast(useSaveBulletin(churchId, bulletin?.id), {
    success: t('comms.bulletinSaved'),
    form: serverErrors,
  });

  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (result) void navigate(`${base}/bulletins/${result.bulletin.id}`, { replace: !bulletin });
  });

  const addable = BULLETIN_SECTION_KINDS.filter(
    (kind) => kind !== 'finance' || sources.data?.financeAvailable,
  );
  const title = bulletin ? t('comms.bulletinEdit') : t('comms.bulletinNew');

  return (
    <Page>
      <PageHeader
        title={title}
        icon={bulletin ? Newspaper : FilePlus2}
        tone={BULLETIN_TONE}
        breadcrumbs={[
          { label: t('comms.bulletins'), to: `${base}/bulletins` },
          ...(bulletin ? [{ label: bulletin.title, to: `${base}/bulletins/${bulletin.id}` }] : []),
          { label: bulletin ? t('common.edit') : t('comms.bulletinNew') },
        ]}
      />
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('comms.bulletinFieldTitle')}
              htmlFor="bulletin-title"
              error={errors.title?.message}
              required
            >
              <Input
                id="bulletin-title"
                autoFocus
                aria-invalid={!!errors.title}
                {...form.register('title')}
              />
            </Field>
            <Field
              label={t('comms.bulletinFieldDate')}
              htmlFor="bulletin-date"
              error={errors.issueDate?.message}
              description={
                sources.data
                  ? t('comms.bulletinWeek', {
                      from: formatDate(sources.data.week.from, 'dayMonth'),
                      to: formatDate(sources.data.week.to, 'dateShort'),
                    })
                  : undefined
              }
              required
            >
              <Input
                id="bulletin-date"
                type="date"
                aria-invalid={!!errors.issueDate}
                {...form.register('issueDate')}
              />
            </Field>
            <Field
              label={t('comms.bulletinFieldTheme')}
              htmlFor="bulletin-theme"
              error={errors.theme?.message}
              className="sm:col-span-2"
            >
              <Input
                id="bulletin-theme"
                placeholder={t('comms.bulletinThemePlaceholder')}
                {...form.register('theme')}
              />
            </Field>
            <Field
              label={t('comms.bulletinFieldCover')}
              htmlFor="bulletin-cover"
              error={errors.coverImageUrl?.message}
              description={t('announcements.coverHint')}
              className="sm:col-span-2"
            >
              <Input
                id="bulletin-cover"
                type="url"
                inputMode="url"
                placeholder="https://"
                {...form.register('coverImageUrl')}
              />
            </Field>
          </CardContent>
        </Card>

        {!sources.data?.servicesAvailable && sources.data ? (
          <Alert variant="info">{t('comms.bulletinWorshipOff')}</Alert>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{t('comms.bulletinSectionsTitle')}</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={sections.fields.length >= 30}
              >
                <Plus />
                {t('comms.bulletinAddSection')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {addable.map((kind) => {
                const Icon = SECTION_ICONS[kind];
                return (
                  <DropdownMenuItem
                    key={kind}
                    onSelect={() =>
                      sections.append({
                        id: newSectionId(),
                        kind,
                        title: localize(BULLETIN_SECTION_LABELS[kind], locale),
                        body: null,
                        itemIds: [],
                      })
                    }
                  >
                    <Icon />
                    {localize(BULLETIN_SECTION_LABELS[kind], locale)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {sections.fields.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t('comms.bulletinNoSections')}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {sections.fields.map((field, index) => (
              <li key={field.key}>
                <SectionEditor
                  control={form.control}
                  index={index}
                  kind={field.kind}
                  sources={validDate ? sources.data : undefined}
                  sourcesLoading={sources.isPending && validDate}
                  error={errors.sections?.[index]?.title?.message}
                  register={form.register}
                  first={index === 0}
                  last={index === sections.fields.length - 1}
                  onMove={(direction) => sections.move(index, index + direction)}
                  onRemove={() => sections.remove(index)}
                />
              </li>
            ))}
          </ol>
        )}

        <FormActions>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              void navigate(bulletin ? `${base}/bulletins/${bulletin.id}` : `${base}/bulletins`)
            }
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={save.isPending}>
            {bulletin ? t('common.saveChanges') : t('comms.bulletinSaveDraft')}
          </Button>
        </FormActions>
        {guard}
      </form>
    </Page>
  );
}

function SectionEditor({
  control,
  index,
  kind,
  sources,
  sourcesLoading,
  error,
  register,
  first,
  last,
  onMove,
  onRemove,
}: {
  control: Control<FormInput, unknown, BulletinInput>;
  index: number;
  kind: BulletinSectionKind;
  sources: BulletinSources | undefined;
  sourcesLoading: boolean;
  error?: string;
  register: ReturnType<typeof useForm<FormInput, unknown, BulletinInput>>['register'];
  first: boolean;
  last: boolean;
  onMove: (direction: 1 | -1) => void;
  onRemove: () => void;
}) {
  const { t, locale, formatDateTime } = useI18n();
  const pickable = (BULLETIN_PICKABLE_KINDS as readonly string[]).includes(kind);
  const options =
    kind === 'announcements'
      ? sources?.announcements
      : kind === 'services'
        ? sources?.services
        : kind === 'events'
          ? sources?.events
          : undefined;
  const titleId = `section-${index}-title`;

  return (
    <Card className="animate-rise-in">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <ToneIcon icon={SECTION_ICONS[kind]} tone={SECTION_TONES[kind]} size="sm" />
          <span className="text-overline min-w-0 flex-1 truncate text-muted-foreground">
            {localize(BULLETIN_SECTION_LABELS[kind], locale)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={first}
            onClick={() => onMove(-1)}
            aria-label={t('comms.bulletinMoveUp')}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={last}
            onClick={() => onMove(1)}
            aria-label={t('comms.bulletinMoveDown')}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={onRemove}
            aria-label={t('comms.bulletinRemoveSection')}
          >
            <Trash2 />
          </Button>
        </div>
        <Field label={t('comms.bulletinSectionTitle')} htmlFor={titleId} error={error}>
          <Input id={titleId} aria-invalid={!!error} {...register(`sections.${index}.title`)} />
        </Field>
        {kind === 'text' ? (
          <Controller
            control={control}
            name={`sections.${index}.body`}
            render={({ field }) => (
              <MarkdownEditor
                aria-label={t('comms.bulletinSectionBody')}
                ref={field.ref}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                rows={6}
              />
            )}
          />
        ) : pickable ? (
          <Controller
            control={control}
            name={`sections.${index}.itemIds`}
            render={({ field }) => {
              const value = field.value ?? [];
              return (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">
                    {value.length === 0
                      ? t('comms.bulletinAllItems')
                      : t('comms.bulletinPicked', { count: value.length })}
                  </p>
                  {sourcesLoading ? (
                    <Skeleton className="h-24" />
                  ) : !options || options.length === 0 ? (
                    <p className="rounded-lg bg-sunken/60 px-3 py-3 text-sm text-muted-foreground">
                      {t('comms.bulletinNothingThisWeek')}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {options.map((option) => (
                        <li key={option.id}>
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary/40 has-[:checked]:bg-accent/50">
                            <Checkbox
                              checked={value.includes(option.id)}
                              onCheckedChange={(checked) =>
                                field.onChange(
                                  checked
                                    ? [...value, option.id]
                                    : value.filter((item) => item !== option.id),
                                )
                              }
                            />
                            <span className="min-w-0 flex-1 truncate">{option.title}</span>
                            {option.startsAt ? (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {formatDateTime(option.startsAt)}
                              </span>
                            ) : null}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {kind === 'finance' ? t('comms.bulletinFinanceHint') : t('comms.bulletinGeneratedHint')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
