import {
  GENDERS,
  GENDER_TEXT,
  PERSON_MEMBERSHIP_STATUSES,
  PERSON_STATUS_TEXT,
  isValidCustomFieldValue,
  localize,
  personFormSchema,
  type CustomFieldDefinition,
  type DirectoryPerson,
  type PersonFormInput,
  type PersonTag,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Contact, IdCard, NotebookPen, Shapes, Tags, UserRound } from 'lucide-react';
import type * as React from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert, Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { useI18n } from '@/lib/i18n';

type FormInput = z.input<typeof personFormSchema>;

export type PersonFormProps = {
  person?: DirectoryPerson;
  /** Current values of the custom fields shown on the form. */
  fieldValues?: Record<string, string | null>;
  fields: CustomFieldDefinition[];
  tags: PersonTag[];
  canEditAdminFields: boolean;
  canEditTags: boolean;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: PersonFormInput, form: PersonFormApi) => Promise<unknown>;
  onCancel: () => void;
};

export type PersonFormApi = ReturnType<typeof useForm<FormInput, unknown, PersonFormInput>>;

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * The person form, for adding and editing. Long, so it warns before leaving with unsaved
 * changes; tags and custom fields are saved together with the profile.
 */
export function PersonForm({
  person,
  fieldValues = {},
  fields,
  tags,
  canEditAdminFields,
  canEditTags,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: PersonFormProps) {
  const { t, locale } = useI18n();
  const form = useForm<FormInput, unknown, PersonFormInput>({
    resolver: zodResolver(personFormSchema),
    defaultValues: {
      firstName: person?.firstName ?? '',
      lastName: person?.lastName ?? '',
      gender: person?.gender ?? 'unspecified',
      birthDate: person?.birthDate ?? '',
      email: person?.email ?? '',
      phone: person?.phone ?? '',
      address: person?.address ?? '',
      photoUrl: person?.photoUrl ?? '',
      membershipStatus: person?.membershipStatus ?? 'visitor',
      joinedAt: person?.joinedAt ?? '',
      weddingDate: person?.weddingDate ?? '',
      notes: person?.notes ?? '',
      tagIds: person?.tagIds ?? [],
      customFields: Object.fromEntries(
        fields.map((field) => [
          field.id,
          fieldValues[field.id] ?? (field.type === 'checkbox' ? 'false' : ''),
        ]),
      ),
    },
  });
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful && !pending);
  const [firstName, lastName, photoUrl] = useWatch({
    control: form.control,
    name: ['firstName', 'lastName', 'photoUrl'],
  });
  const fieldError = (id: string) =>
    (errors.customFields as Record<string, { message?: string }> | undefined)?.[id]?.message;

  const submit = form.handleSubmit(async (values) => {
    // Type checks for custom fields happen here too, so mistakes show before a round trip.
    let valid = true;
    const customFields: Record<string, string | null> = {};
    for (const field of fields) {
      const raw = values.customFields?.[field.id];
      const value = raw === undefined || raw === null ? '' : String(raw).trim();
      if (value && !isValidCustomFieldValue(field, value)) {
        form.setError(`customFields.${field.id}`, { message: t('people.fieldInvalid') });
        valid = false;
      } else if (!value && field.isRequired) {
        form.setError(`customFields.${field.id}`, { message: t('people.fieldRequired') });
        valid = false;
      }
      customFields[field.id] = value || null;
    }
    if (!valid) return;
    await onSubmit(
      {
        ...values,
        tagIds: canEditTags ? values.tagIds : undefined,
        customFields: fields.length > 0 ? customFields : undefined,
      },
      form,
    );
  });

  const preview = [firstName, lastName].filter(Boolean).join(' ') || t('people.newPerson');

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4"
      noValidate
      aria-busy={pending || undefined}
    >
      {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}

      <FormSection icon={UserRound} title={t('people.sectionIdentity')}>
        <div className="flex items-center gap-4">
          <EntityAvatar name={preview} src={photoUrl || null} size="lg" />
          <p className="text-sm text-muted-foreground">{t('people.photoHint')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('people.firstName')}
            htmlFor="firstName"
            error={errors.firstName?.message}
            required
          >
            <Input
              id="firstName"
              autoComplete="given-name"
              autoFocus
              {...form.register('firstName')}
              aria-invalid={!!errors.firstName}
            />
          </Field>
          <Field label={t('people.lastName')} htmlFor="lastName" error={errors.lastName?.message}>
            <Input id="lastName" autoComplete="family-name" {...form.register('lastName')} />
          </Field>
        </div>
        <Field label={t('people.gender')} error={errors.gender?.message}>
          <Controller
            control={form.control}
            name="gender"
            render={({ field }) => (
              <Segmented
                aria-label={t('people.gender')}
                value={field.value ?? 'unspecified'}
                onChange={field.onChange}
                options={GENDERS.map((gender) => ({
                  value: gender,
                  label: localize(GENDER_TEXT[gender], locale),
                }))}
              />
            )}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('people.birthDate')}
            htmlFor="birthDate"
            error={errors.birthDate?.message}
          >
            <Input
              id="birthDate"
              type="date"
              {...form.register('birthDate')}
              aria-invalid={!!errors.birthDate}
            />
          </Field>
          <Field label={t('people.photoUrl')} htmlFor="photoUrl" error={errors.photoUrl?.message}>
            <Input
              id="photoUrl"
              type="url"
              inputMode="url"
              placeholder="https://"
              {...form.register('photoUrl')}
              aria-invalid={!!errors.photoUrl}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        icon={Contact}
        title={t('people.sectionContact')}
        description={t('people.sectionContactHint')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('people.phone')} htmlFor="person-phone" error={errors.phone?.message}>
            <Input
              id="person-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0812…"
              {...form.register('phone')}
            />
          </Field>
          <Field
            label={t('people.emailLabel')}
            htmlFor="person-email"
            error={errors.email?.message}
          >
            <Input
              id="person-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              {...form.register('email')}
              aria-invalid={!!errors.email}
            />
          </Field>
        </div>
        <Field label={t('people.address')} htmlFor="person-address" error={errors.address?.message}>
          <Textarea
            id="person-address"
            rows={2}
            autoComplete="street-address"
            {...form.register('address')}
          />
        </Field>
      </FormSection>

      <FormSection
        icon={IdCard}
        title={t('people.sectionMembership')}
        description={canEditAdminFields ? undefined : t('people.sectionMembershipLocked')}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {canEditAdminFields ? (
            <>
              <Field
                label={t('people.status')}
                htmlFor="membershipStatus"
                error={errors.membershipStatus?.message}
              >
                <Select id="membershipStatus" {...form.register('membershipStatus')}>
                  {PERSON_MEMBERSHIP_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {localize(PERSON_STATUS_TEXT[status], locale)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t('people.joinedAt')}
                htmlFor="joinedAt"
                error={errors.joinedAt?.message}
              >
                <Input id="joinedAt" type="date" {...form.register('joinedAt')} />
              </Field>
            </>
          ) : null}
          <Field
            label={t('people.weddingDate')}
            htmlFor="weddingDate"
            error={errors.weddingDate?.message}
          >
            <Input id="weddingDate" type="date" {...form.register('weddingDate')} />
          </Field>
        </div>
      </FormSection>

      {canEditTags && tags.length > 0 ? (
        <FormSection icon={Tags} title={t('people.tags')} description={t('people.tagsHint')}>
          <label htmlFor="person-tags" className="sr-only">
            {t('people.tags')}
          </label>
          <Controller
            control={form.control}
            name="tagIds"
            render={({ field }) => (
              <Combobox
                multiple
                id="person-tags"
                value={field.value ?? []}
                onChange={field.onChange}
                placeholder={t('people.chooseTags')}
                searchPlaceholder={t('people.searchTags')}
                options={tags.map((tag) => ({
                  value: tag.id,
                  label: tag.name,
                  leading: (
                    <span
                      aria-hidden
                      className="block size-2.5 rounded-full bg-muted-foreground/40"
                      style={tag.color ? { backgroundColor: tag.color } : undefined}
                    />
                  ),
                }))}
                clearable
              />
            )}
          />
        </FormSection>
      ) : null}

      {fields.length > 0 ? (
        <FormSection icon={Shapes} title={t('people.customFields')}>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => {
              const id = `field-${field.id}`;
              const error = fieldError(field.id);
              const label = (
                <span className="inline-flex items-center gap-1.5">
                  {field.label}
                  {field.isPrivate ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      · {t('people.privateField')}
                    </span>
                  ) : null}
                </span>
              );
              const name = `customFields.${field.id}` as const;
              return (
                <Field
                  key={field.id}
                  label={label}
                  htmlFor={id}
                  error={error}
                  description={field.helpText ?? undefined}
                  required={field.isRequired}
                  className={field.type === 'text' ? 'sm:col-span-2' : undefined}
                >
                  {field.type === 'select' ? (
                    <Select id={id} {...form.register(name)} aria-invalid={!!error}>
                      <option value="">{t('common.none')}</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  ) : field.type === 'checkbox' ? (
                    <Controller
                      control={form.control}
                      name={name}
                      render={({ field: control }) => (
                        <label className="flex h-11 items-center gap-3 text-sm">
                          <Switch
                            id={id}
                            checked={control.value === 'true'}
                            onCheckedChange={(checked) =>
                              control.onChange(checked ? 'true' : 'false')
                            }
                          />
                          {control.value === 'true' ? t('common.yes') : t('common.no')}
                        </label>
                      )}
                    />
                  ) : (
                    <Input
                      id={id}
                      type={field.type === 'date' ? 'date' : 'text'}
                      inputMode={field.type === 'number' ? 'decimal' : undefined}
                      {...form.register(name)}
                      aria-invalid={!!error}
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </FormSection>
      ) : null}

      <FormSection icon={NotebookPen} title={t('people.notes')} description={t('people.notesHint')}>
        <Textarea id="notes" aria-label={t('people.notes')} rows={3} {...form.register('notes')} />
      </FormSection>

      <FormActions>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={pending || isSubmitting}>
          {submitLabel}
        </Button>
      </FormActions>
      {guard}
    </form>
  );
}
