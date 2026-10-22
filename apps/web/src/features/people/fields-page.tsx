import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  customFieldDefinitionInputSchema,
  localize,
  personTagInputSchema,
  type CustomFieldDefinition,
  type CustomFieldDefinitionInput,
  type PersonTag,
  type PersonTagInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { EyeOff, Pencil, Plus, Shapes, Tag, Tags, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
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
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RowActions } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import {
  fieldsQuery,
  tagsQuery,
  useDeleteField,
  useDeleteTag,
  useSaveField,
  useSaveTag,
} from './api';
import { ColorSwatches, TagChip } from './people-ui';

/** Tags (label) and custom fields (kolom tambahan) for person records. */
export function FieldsPage() {
  const { churchId, base } = useChurch();
  const { t, locale, formatNumber } = useI18n();
  const tags = useQuery(tagsQuery(churchId));
  const fields = useQuery(fieldsQuery(churchId));
  const [tagDialog, setTagDialog] = useState<PersonTag | 'new' | null>(null);
  const [fieldDialog, setFieldDialog] = useState<CustomFieldDefinition | 'new' | null>(null);
  const [deletingTag, setDeletingTag] = useState<PersonTag | null>(null);
  const [deletingField, setDeletingField] = useState<CustomFieldDefinition | null>(null);
  const removeTag = useMutationToast(useDeleteTag(churchId));
  const removeField = useMutationToast(useDeleteField(churchId));

  return (
    <Page>
      <PageHeader
        icon={Tags}
        tone="sky"
        breadcrumbs={[
          { label: t('people.title'), to: `${base}/people` },
          { label: t('people.fieldsTitle') },
        ]}
        title={t('people.fieldsTitle')}
        description={t('people.fieldsDescription')}
      />

      <Section
        title={t('people.tags')}
        icon={Tag}
        description={t('people.tagsSectionHint')}
        action={
          <Button size="sm" onClick={() => setTagDialog('new')}>
            <Plus /> {t('people.newTag')}
          </Button>
        }
      >
        {tags.isPending ? (
          <SkeletonList rows={3} avatar={false} />
        ) : tags.isError ? (
          <ErrorState
            compact
            message={getErrorMessage(tags.error)}
            onRetry={() => void tags.refetch()}
          />
        ) : tags.data.items.length === 0 ? (
          <EmptyState
            compact
            icon={Tag}
            tone="sky"
            title={t('people.tagsEmpty')}
            description={t('people.tagsEmptyHint')}
            action={
              <Button onClick={() => setTagDialog('new')}>
                <Plus /> {t('people.newTag')}
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
            {tags.data.items.map((tag) => (
              <li key={tag.id} className="flex min-h-14 items-center gap-3 py-2 pr-2 pl-4">
                <TagChip tag={tag} className="max-w-none" />
                <Link
                  to={`${base}/people?tag=${tag.id}`}
                  className="ml-auto text-sm text-muted-foreground tabular hover:text-foreground hover:underline"
                >
                  {t('people.personCount', {
                    count: tag.personCount,
                    formatted: formatNumber(tag.personCount),
                  })}
                </Link>
                <RowActions
                  label={t('people.actionsFor', { name: tag.name })}
                  actions={[
                    {
                      id: 'edit',
                      label: t('common.edit'),
                      icon: Pencil,
                      onSelect: () => setTagDialog(tag),
                    },
                    {
                      id: 'delete',
                      label: t('common.delete'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setDeletingTag(tag),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t('people.customFields')}
        icon={Shapes}
        description={t('people.fieldsSectionHint')}
        action={
          <Button size="sm" onClick={() => setFieldDialog('new')}>
            <Plus /> {t('people.newField')}
          </Button>
        }
      >
        {fields.isPending ? (
          <SkeletonList rows={3} avatar={false} />
        ) : fields.isError ? (
          <ErrorState
            compact
            message={getErrorMessage(fields.error)}
            onRetry={() => void fields.refetch()}
          />
        ) : fields.data.items.length === 0 ? (
          <EmptyState
            compact
            icon={Shapes}
            tone="violet"
            title={t('people.fieldsEmpty')}
            description={t('people.fieldsEmptyHint')}
            action={
              <Button onClick={() => setFieldDialog('new')}>
                <Plus /> {t('people.newField')}
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
            {fields.data.items.map((field) => (
              <li key={field.id} className="flex min-h-16 items-center gap-3 py-2.5 pr-2 pl-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {field.label}
                    {!field.isActive ? (
                      <StatusBadge size="sm">{t('people.inactiveField')}</StatusBadge>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{field.key}</code>
                    {' · '}
                    {localize(CUSTOM_FIELD_TYPE_LABELS[field.type], locale)}
                    {field.type === 'select' ? ` (${field.options.join(', ')})` : ''}
                  </p>
                </div>
                <div className="hidden items-center gap-1.5 sm:flex">
                  {field.isRequired ? (
                    <StatusBadge size="sm" tone="warning">
                      {t('common.required')}
                    </StatusBadge>
                  ) : null}
                  {field.isPrivate ? (
                    <StatusBadge size="sm" tone="violet" icon={EyeOff}>
                      {t('people.privateField')}
                    </StatusBadge>
                  ) : null}
                </div>
                <RowActions
                  label={t('people.actionsFor', { name: field.label })}
                  actions={[
                    {
                      id: 'edit',
                      label: t('common.edit'),
                      icon: Pencil,
                      onSelect: () => setFieldDialog(field),
                    },
                    {
                      id: 'delete',
                      label: t('common.delete'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setDeletingField(field),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <TagDialog
        key={tagDialog === 'new' ? 'new' : (tagDialog?.id ?? 'closed')}
        tag={tagDialog === 'new' ? undefined : (tagDialog ?? undefined)}
        open={!!tagDialog}
        onOpenChange={(open) => !open && setTagDialog(null)}
      />
      <FieldDialog
        key={fieldDialog === 'new' ? 'new' : (fieldDialog?.id ?? 'closed')}
        field={fieldDialog === 'new' ? undefined : (fieldDialog ?? undefined)}
        open={!!fieldDialog}
        onOpenChange={(open) => !open && setFieldDialog(null)}
      />
      <ConfirmDialog
        open={!!deletingTag}
        onOpenChange={(open) => !open && setDeletingTag(null)}
        title={t('people.deleteTagTitle', { name: deletingTag?.name ?? '' })}
        description={t('people.deleteTagDescription', { count: deletingTag?.personCount ?? 0 })}
        confirmLabel={t('common.delete')}
        loading={removeTag.isPending}
        onConfirm={async () => {
          if (deletingTag && (await removeTag.run(deletingTag.id))) setDeletingTag(null);
        }}
      />
      <ConfirmDialog
        open={!!deletingField}
        onOpenChange={(open) => !open && setDeletingField(null)}
        title={t('people.deleteFieldTitle', { name: deletingField?.label ?? '' })}
        description={t('people.deleteFieldDescription')}
        confirmText={deletingField?.key}
        confirmLabel={t('common.delete')}
        loading={removeField.isPending}
        onConfirm={async () => {
          if (deletingField && (await removeField.run(deletingField.id))) setDeletingField(null);
        }}
      />
    </Page>
  );
}

function TagDialog({
  tag,
  open,
  onOpenChange,
}: {
  tag?: PersonTag;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const form = useForm<z.input<typeof personTagInputSchema>, unknown, PersonTagInput>({
    resolver: zodResolver(personTagInputSchema),
    defaultValues: { name: tag?.name ?? '', color: tag?.color ?? null },
  });
  const save = useMutationToast(useSaveTag(churchId, tag?.id), {
    success: tag ? t('people.tagSaved') : t('people.tagCreated'),
    form,
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    if (await save.run(values)) onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tag ? t('people.editTag') : t('people.newTag')}</DialogTitle>
          <DialogDescription>{t('people.tagHint')}</DialogDescription>
        </DialogHeader>
        <form
          id="tag-form"
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-4"
          noValidate
        >
          <Field
            label={t('people.tagName')}
            htmlFor="tag-name"
            error={errors.name?.message}
            required
          >
            <Input
              id="tag-name"
              autoFocus
              placeholder={t('people.tagNamePlaceholder')}
              {...form.register('name')}
              aria-invalid={!!errors.name}
            />
          </Field>
          <Field label={t('people.color')} error={errors.color?.message}>
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <ColorSwatches
                  value={field.value}
                  onChange={field.onChange}
                  label={t('people.color')}
                />
              )}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="tag-form" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FieldForm = Omit<z.input<typeof customFieldDefinitionInputSchema>, 'options'> & {
  options: { value: string }[];
};

/** Turns a label into a machine key: "Pekerjaan Utama" → "pekerjaan_utama". */
const keyFromLabel = (label: string) =>
  label
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'f_$1')
    .slice(0, 40);

function FieldDialog({
  field,
  open,
  onOpenChange,
}: {
  field?: CustomFieldDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t, locale } = useI18n();
  const form = useForm<FieldForm>({
    defaultValues: {
      key: field?.key ?? '',
      label: field?.label ?? '',
      type: field?.type ?? 'text',
      options: (field?.options ?? []).map((value) => ({ value })),
      helpText: field?.helpText ?? '',
      isRequired: field?.isRequired ?? false,
      isPrivate: field?.isPrivate ?? false,
      isActive: field?.isActive ?? true,
      sortOrder: field?.sortOrder ?? 0,
    },
  });
  const options = useFieldArray({ control: form.control, name: 'options' });
  const save = useMutationToast(useSaveField(churchId, field?.id), {
    success: field ? t('people.fieldSaved') : t('people.fieldCreated'),
    form,
    fields: ['key', 'label', 'type', 'options', 'helpText'],
  });
  const errors = form.formState.errors;
  const type = useWatch({ control: form.control, name: 'type' });
  const [keyTouched, setKeyTouched] = useState(!!field);
  const submit = form.handleSubmit(async (values) => {
    const parsed = customFieldDefinitionInputSchema.safeParse({
      ...values,
      options: values.options.map((option) => option.value).filter((value) => value.trim()),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = String(issue.path[0] ?? 'label') as keyof FieldForm;
        form.setError(path, { message: issue.message });
      }
      return;
    }
    const result = await save.run(parsed.data as CustomFieldDefinitionInput);
    if (result) onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{field ? t('people.editField') : t('people.newField')}</DialogTitle>
          <DialogDescription>{t('people.fieldHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="field-form"
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('people.fieldLabel')}
                htmlFor="field-label"
                error={errors.label?.message}
                required
              >
                <Input
                  id="field-label"
                  autoFocus
                  placeholder={t('people.fieldLabelPlaceholder')}
                  {...form.register('label', {
                    onChange: (event: { target: { value: string } }) => {
                      if (!keyTouched) form.setValue('key', keyFromLabel(event.target.value));
                    },
                  })}
                  aria-invalid={!!errors.label}
                />
              </Field>
              <Field
                label={t('people.fieldKey')}
                htmlFor="field-key"
                error={errors.key?.message}
                description={t('people.fieldKeyHint')}
              >
                <Input
                  id="field-key"
                  className="font-mono"
                  autoCapitalize="off"
                  spellCheck={false}
                  {...form.register('key', { onChange: () => setKeyTouched(true) })}
                  aria-invalid={!!errors.key}
                />
              </Field>
            </div>
            <Field
              label={t('people.fieldType')}
              htmlFor="field-type"
              description={field ? t('people.fieldTypeLocked') : undefined}
            >
              <Select id="field-type" {...form.register('type')}>
                {CUSTOM_FIELD_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {localize(CUSTOM_FIELD_TYPE_LABELS[value], locale)}
                  </option>
                ))}
              </Select>
            </Field>
            {type === 'select' ? (
              <Field
                label={t('people.fieldOptions')}
                error={errors.options?.message ?? errors.options?.root?.message}
              >
                <div className="flex flex-col gap-2">
                  {options.fields.map((option, index) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <Input
                        aria-label={t('people.optionNumber', { number: index + 1 })}
                        {...form.register(`options.${index}.value`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            options.append({ value: '' });
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('common.remove')}
                        onClick={() => options.remove(index)}
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => options.append({ value: '' })}
                  >
                    <Plus /> {t('people.addOption')}
                  </Button>
                </div>
              </Field>
            ) : null}
            <Field label={t('people.fieldHelp')} htmlFor="field-help">
              <Input id="field-help" {...form.register('helpText')} />
            </Field>
            <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/70">
              {(
                [
                  ['isRequired', 'people.fieldRequiredToggle', 'people.fieldRequiredHint'],
                  ['isPrivate', 'people.fieldPrivateToggle', 'people.fieldPrivateHint'],
                  ['isActive', 'people.fieldActiveToggle', 'people.fieldActiveHint'],
                ] as const
              ).map(([name, label, hint]) => (
                <Controller
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field: control }) => (
                    <label className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-sm">
                      <span>
                        <span className="block font-medium">{t(label)}</span>
                        <span className="block text-muted-foreground">{t(hint)}</span>
                      </span>
                      <Switch checked={!!control.value} onCheckedChange={control.onChange} />
                    </label>
                  )}
                />
              ))}
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="field-form" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
