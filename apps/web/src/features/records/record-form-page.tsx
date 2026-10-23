import {
  BAPTISM_KINDS,
  BAPTISM_KIND_LABELS,
  PRIVATE_RECORD_DETAILS,
  RECORD_TYPE_DETAILS,
  RECORD_TYPE_ROLES,
  REGISTRY_RECORD_TYPES,
  RECORDS_LIMITS,
  localize,
  recordPrimaryRole,
  registryRecordCorrectionSchema,
  registryRecordInputSchema,
  requiredText,
  type RecordPersonRole,
  type RecordPreview,
  type RegistryRecord,
  type RegistryRecordType,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FileText, Info, Plus, ScrollText, UserRoundPlus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch, type FieldErrors, type Resolver } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, Segmented } from '@/components/ui/misc';
import { SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { ApiClientError, getErrorMessage, isApiClientError } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { recordQuery, useCorrectRecord, useCreateRecord, usePreviewRecord } from './api';
import { PersonField, type PersonValue } from './person-field';
import {
  DATE_DETAILS,
  DETAIL_LABEL_KEYS,
  RECORDS_TONE,
  RECORD_TYPE_META,
  isRecordType,
  otherChurchLabelKey,
  recordTitle,
  roleLabelKey,
} from './records-lib';
import { RecordNumber, SideEffectList } from './records-ui';

/** One form for entering and correcting; a correction also asks why. */
const correctionFormSchema = z.intersection(
  registryRecordInputSchema,
  z.object({ correctionNote: registryRecordCorrectionSchema.shape.correctionNote }),
);
const entryFormSchema = z.intersection(
  registryRecordInputSchema,
  z.object({ correctionNote: requiredText(0, RECORDS_LIMITS.correctionNoteMax).optional() }),
);

type FormInput = z.input<typeof correctionFormSchema>;
type FormOutput = z.output<typeof correctionFormSchema>;
type PersonEntry = { personId: string | null; name: string | null; role: RecordPersonRole };

const MULTI_ROLES: readonly RecordPersonRole[] = ['godparent', 'witness', 'other'];

const todayIn = (timezone: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

/** Puts the people in the order of the certificate: who it is about, parents, then the rest. */
const ROLE_ORDER: readonly RecordPersonRole[] = [
  'subject',
  'spouse',
  'father',
  'mother',
  'godparent',
  'witness',
  'other',
];
const ordered = (people: PersonEntry[]) =>
  [...people].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

const primarySlots = (type: RegistryRecordType) => (type === 'marriage' ? 2 : 1);

const blankPeople = (type: RegistryRecordType): PersonEntry[] =>
  Array.from({ length: primarySlots(type) }, () => ({
    personId: null,
    name: null,
    role: recordPrimaryRole(type),
  }));

export function NewRecordPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('type') ?? '';
  if (!isRecordType(raw)) {
    return <TypePicker onPick={(type) => setParams({ type }, { replace: false })} />;
  }
  return <RecordFormPage key={raw} type={raw} />;
}

export function CorrectRecordPage() {
  const { recordId = '' } = useParams();
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const query = useQuery(recordQuery(churchId, recordId));
  if (query.isPending) {
    return (
      <Page>
        <SkeletonText lines={12} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader
          title={t('records.correctTitle')}
          breadcrumbs={[
            { label: t('records.nav'), to: `${base}/records` },
            { label: t('records.correctTitle') },
          ]}
        />
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={
            isApiClientError(query.error) && query.error.status === 404
              ? undefined
              : () => void query.refetch()
          }
        />
      </Page>
    );
  }
  const { record } = query.data;
  if (record.status === 'voided') {
    return (
      <Page>
        <PageHeader title={t('records.correctTitle')} backTo={`${base}/records/${record.id}`} />
        <Alert variant="warning" title={t('records.voidedCannotCorrect')} />
      </Page>
    );
  }
  return <RecordFormPage type={record.type} record={record} />;
}

/** Step one of a new record: which kind. */
function TypePicker({ onPick }: { onPick: (type: RegistryRecordType) => void }) {
  const { base } = useChurch();
  const { t } = useI18n();
  return (
    <Page>
      <PageHeader
        title={t('records.newRecord')}
        description={t('records.chooseTypeHint')}
        icon={ScrollText}
        tone={RECORDS_TONE}
        breadcrumbs={[
          { label: t('records.nav'), to: `${base}/records` },
          { label: t('records.newRecord') },
        ]}
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {REGISTRY_RECORD_TYPES.map((type, index) => {
          const meta = RECORD_TYPE_META[type];
          return (
            <li
              key={type}
              className="animate-rise-in"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <button
                type="button"
                autoFocus={index === 0}
                onClick={() => onPick(type)}
                data-tone={meta.tone}
                className="pressable group flex w-full items-center gap-3.5 rounded-xl border border-border/70 bg-card p-4 text-left shadow-soft transition-[border-color,box-shadow] duration-200 outline-none hover:border-tone focus-visible:ring-[3px] focus-visible:ring-ring/30"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-tone-soft text-tone-ink">
                  <meta.icon className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold tracking-tight">{t(meta.newKey)}</span>
                  <span className="mt-0.5 block text-sm text-pretty text-muted-foreground">
                    {t(meta.hintKey)}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

function RecordFormPage({ type, record }: { type: RegistryRecordType; record?: RegistryRecord }) {
  const { churchId, base, church } = useChurch();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const meta = RECORD_TYPE_META[type];
  const correcting = !!record;
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(correcting ? correctionFormSchema : entryFormSchema) as Resolver<
      FormInput,
      unknown,
      FormOutput
    >,
    defaultValues: {
      type,
      subtype: record?.subtype ?? (type === 'baptism' ? 'infant' : ''),
      date: record?.date ?? todayIn(church.timezone),
      place: record?.place ?? (record ? '' : church.name),
      officiantPersonId: record?.officiantPersonId ?? null,
      officiantName: record?.officiantName ?? '',
      details: { ...(record?.details ?? {}) },
      documentUrl: record?.documentUrl ?? '',
      notes: record?.notes ?? '',
      people: record
        ? record.people.map((person) => ({
            personId: person.personId,
            name: person.name,
            role: person.role,
          }))
        : blankPeople(type),
      applyStatusEffect: false,
      correctionNote: '',
    },
  });
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const [saved, setSaved] = useState(false);
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful && !saved);
  const [pending, setPending] = useState<{ values: FormOutput; preview: RecordPreview } | null>(
    null,
  );
  const [apply, setApply] = useState(true);
  const preview = usePreviewRecord(churchId);
  const create = useCreateRecord(churchId);
  const correct = useCorrectRecord(churchId, record?.id ?? '');
  const saving = create.isPending || correct.isPending;

  /** Server paths are `date` (entry) or `record.date` (correction); the form has them flat. */
  const showErrors = (error: unknown) => {
    const flat =
      isApiClientError(error) && error.code === 'VALIDATION'
        ? new ApiClientError(
            error.code,
            error.message,
            error.status,
            error.issues.map((issue) => ({ ...issue, path: issue.path.replace(/^record\./, '') })),
          )
        : error;
    const fields = Object.keys(form.getValues());
    if (applyServerErrors(flat, form.setError, fields)) {
      toast.error(t('common.fixErrors'));
    } else {
      toast.error(getErrorMessage(error));
    }
  };

  const toInput = (values: FormOutput) => {
    const { correctionNote: _note, ...input } = values;
    return input;
  };

  const submit = form.handleSubmit(async (values) => {
    if (preview.isPending || saving) return;
    try {
      const result = await preview.mutateAsync({ record: toInput(values), recordId: record?.id });
      setApply(true);
      setPending({ values, preview: result });
    } catch (error) {
      showErrors(error);
    }
  });

  const confirm = async () => {
    if (!pending || saving) return;
    const input = { ...toInput(pending.values), applyStatusEffect: apply };
    try {
      const result = record
        ? await correct.mutateAsync({
            record: input,
            correctionNote: pending.values.correctionNote ?? '',
          })
        : await create.mutateAsync(input);
      setSaved(true);
      setPending(null);
      toast.success(
        record
          ? t('records.correctedToast', { number: result.record.number })
          : t('records.savedToast', { number: result.record.number }),
      );
      void navigate(`${base}/records/${result.record.id}`, { replace: !record });
    } catch (error) {
      setPending(null);
      showErrors(error);
    }
  };

  const title = record ? t('records.correctTitle') : t(meta.newKey);
  const details = RECORD_TYPE_DETAILS[type];
  const roles = RECORD_TYPE_ROLES[type];

  return (
    <Page>
      <PageHeader
        title={title}
        eyebrow={record?.number}
        description={record ? undefined : t(meta.hintKey)}
        icon={meta.icon}
        tone={meta.tone}
        breadcrumbs={[
          { label: t('records.nav'), to: `${base}/records` },
          ...(record
            ? [{ label: recordTitle(record), to: `${base}/records/${record.id}` }]
            : [{ label: t('records.newRecord'), to: `${base}/records/new` }]),
          { label: title },
        ]}
      />
      {record ? (
        <Alert variant="info" title={t('records.correctionInfoTitle')}>
          {t('records.correctionInfoBody')}
        </Alert>
      ) : null}

      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>{t('records.sectionEvent')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {type === 'baptism' ? (
              <Controller
                control={form.control}
                name="subtype"
                render={({ field }) => (
                  <Field label={t('records.fieldBaptismKind')} error={errors.subtype?.message}>
                    <Segmented
                      aria-label={t('records.fieldBaptismKind')}
                      value={field.value === 'adult' ? 'adult' : 'infant'}
                      onChange={(value) => field.onChange(value)}
                      options={BAPTISM_KINDS.map((kind) => ({
                        value: kind,
                        label: localize(BAPTISM_KIND_LABELS[kind], locale),
                      }))}
                    />
                  </Field>
                )}
              />
            ) : null}
            {type === 'custom' ? (
              <Field
                label={t('records.fieldMilestone')}
                htmlFor="record-subtype"
                error={errors.subtype?.message}
                description={t('records.fieldMilestoneHint')}
                required
              >
                <Input
                  id="record-subtype"
                  autoFocus
                  aria-invalid={!!errors.subtype}
                  {...form.register('subtype')}
                />
              </Field>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <Field
                label={t(type === 'death' ? 'records.fieldDeathDate' : 'records.fieldDate')}
                htmlFor="record-date"
                error={errors.date?.message}
                required
              >
                <Input
                  id="record-date"
                  type="date"
                  autoFocus={type !== 'custom'}
                  aria-invalid={!!errors.date}
                  {...form.register('date')}
                />
              </Field>
              <Field
                label={t(type === 'death' ? 'records.fieldDeathPlace' : 'records.fieldPlace')}
                htmlFor="record-place"
                error={errors.place?.message}
              >
                <Input
                  id="record-place"
                  aria-invalid={!!errors.place}
                  {...form.register('place')}
                />
              </Field>
            </div>
            {type !== 'death' && type !== 'transfer_in' && type !== 'transfer_out' ? (
              <OfficiantField form={form} />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('records.sectionPeople')}</CardTitle>
            <CardDescription>{t('records.sectionPeopleHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              control={form.control}
              name="people"
              render={({ field }) => (
                <PeopleEditor
                  type={type}
                  roles={roles}
                  value={(field.value ?? []) as PersonEntry[]}
                  onChange={field.onChange}
                  errors={errors}
                  onPicked={(person) => {
                    if (
                      (type === 'baptism' || type === 'child_dedication') &&
                      person.birthDate &&
                      !form.getValues('details.birthDate')
                    ) {
                      form.setValue('details.birthDate', person.birthDate, { shouldDirty: true });
                    }
                  }}
                />
              )}
            />
          </CardContent>
        </Card>

        {details.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('records.sectionDetails')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {details.map((key) => {
                const id = `record-detail-${key}`;
                const error = errors.details?.[key]?.message;
                const label =
                  key === 'otherChurchName'
                    ? t(otherChurchLabelKey(type))
                    : t(DETAIL_LABEL_KEYS[key]);
                return (
                  <Field
                    key={key}
                    label={label}
                    htmlFor={id}
                    error={error}
                    description={
                      PRIVATE_RECORD_DETAILS.includes(key)
                        ? t('records.privateDetailHint')
                        : undefined
                    }
                    className={cn(
                      (key === 'otherChurchName' ||
                        key === 'otherChurchAddress' ||
                        key === 'verse' ||
                        key === 'burialPlace') &&
                        'sm:col-span-2',
                    )}
                  >
                    <Input
                      id={id}
                      type={DATE_DETAILS.includes(key) ? 'date' : 'text'}
                      aria-invalid={!!error}
                      {...form.register(`details.${key}`)}
                    />
                  </Field>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('records.sectionDocument')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field
              label={t('records.fieldDocument')}
              htmlFor="record-document"
              error={errors.documentUrl?.message}
              description={t('records.fieldDocumentHint')}
            >
              <Input
                id="record-document"
                type="url"
                inputMode="url"
                placeholder="https://"
                aria-invalid={!!errors.documentUrl}
                {...form.register('documentUrl')}
              />
            </Field>
            <Field
              label={t('records.fieldNotes')}
              htmlFor="record-notes"
              error={errors.notes?.message}
              description={t('records.fieldNotesHint')}
            >
              <Textarea id="record-notes" rows={3} {...form.register('notes')} />
            </Field>
          </CardContent>
        </Card>

        {record ? (
          <Card>
            <CardContent>
              <Field
                label={t('records.fieldCorrectionNote')}
                htmlFor="record-correction"
                error={errors.correctionNote?.message}
                description={t('records.fieldCorrectionNoteHint')}
                required
              >
                <Textarea
                  id="record-correction"
                  rows={2}
                  aria-invalid={!!errors.correctionNote}
                  {...form.register('correctionNote')}
                />
              </Field>
            </CardContent>
          </Card>
        ) : null}

        <FormActions>
          <Button type="button" variant="ghost" onClick={() => void navigate(-1)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={preview.isPending}>
            {record ? t('records.saveCorrection') : t('records.reviewAndSave')}
          </Button>
        </FormActions>
        {guard}
      </form>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        variant="default"
        title={record ? t('records.confirmCorrectTitle') : t('records.confirmTitle')}
        description={
          record
            ? t('records.confirmCorrectBody')
            : t('records.confirmBody', { type: t(meta.newKey).toLowerCase() })
        }
        confirmLabel={record ? t('records.saveCorrection') : t('records.saveRecord')}
        loading={saving}
        onConfirm={confirm}
      >
        {pending ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5">
              <span className="text-sm text-muted-foreground">
                {record ? t('records.keepsNumber') : t('records.getsNumber')}
              </span>
              <RecordNumber number={pending.preview.number} className="text-sm" />
            </div>
            {pending.preview.duplicate ? (
              <Alert variant="warning" title={t('records.duplicateTitle')}>
                {t('records.duplicateBody', { number: pending.preview.duplicate.number })}{' '}
                <Link
                  to={`${base}/records/${pending.preview.duplicate.id}`}
                  className="font-medium underline underline-offset-2"
                >
                  {t('records.openRecord')}
                </Link>
              </Alert>
            ) : null}
            {pending.preview.effects.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Info className="size-4 text-muted-foreground" />
                  {t('records.effectsTitle')}
                </p>
                <SideEffectList effects={pending.preview.effects} />
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="record-apply-effects"
                    checked={apply}
                    onCheckedChange={(checked) => setApply(checked === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="record-apply-effects" className="leading-snug font-normal">
                    {t('records.applyEffects')}
                  </Label>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('records.noEffects')}</p>
            )}
          </div>
        ) : null}
      </ConfirmDialog>
    </Page>
  );
}

function OfficiantField({
  form,
}: {
  form: ReturnType<typeof useForm<FormInput, unknown, FormOutput>>;
}) {
  const { t } = useI18n();
  const personId = useWatch({ control: form.control, name: 'officiantPersonId' }) ?? null;
  const name = useWatch({ control: form.control, name: 'officiantName' }) ?? null;
  return (
    <PersonField
      id="record-officiant"
      label={t('records.fieldOfficiant')}
      description={t('records.fieldOfficiantHint')}
      value={{ personId, name }}
      error={form.formState.errors.officiantName?.message}
      onChange={(value: PersonValue) => {
        form.setValue('officiantPersonId', value.personId, { shouldDirty: true });
        form.setValue('officiantName', value.name ?? '', { shouldDirty: true });
      }}
    />
  );
}

/** The people on a record, grouped by role in certificate order. */
function PeopleEditor({
  type,
  roles,
  value,
  onChange,
  errors,
  onPicked,
}: {
  type: RegistryRecordType;
  roles: readonly RecordPersonRole[];
  value: PersonEntry[];
  onChange: (value: PersonEntry[]) => void;
  errors: FieldErrors<FormInput>;
  onPicked: (person: { id: string; name: string; birthDate: string | null }) => void;
}) {
  const { t } = useI18n();
  const primary = recordPrimaryRole(type);
  const indexed = value.map((entry, index) => ({ entry, index }));
  const ofRole = (role: RecordPersonRole) => indexed.filter((item) => item.entry.role === role);
  const peopleErrors = errors.people as
    (FieldErrors<FormInput>['people'] & { message?: string }) | undefined;
  const errorAt = (index: number) => {
    const item = (peopleErrors as Record<number, { name?: { message?: string } }> | undefined)?.[
      index
    ];
    return item?.name?.message;
  };

  const update = (index: number, next: PersonValue) =>
    onChange(value.map((entry, i) => (i === index ? { ...entry, ...next } : entry)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = (role: RecordPersonRole) =>
    onChange(ordered([...value, { personId: null, name: null, role }]));
  /** Father and mother are single optional slots: empty means not named. */
  const setSingle = (role: RecordPersonRole, next: PersonValue) => {
    const existing = ofRole(role)[0];
    const empty = !next.personId && !next.name;
    if (existing) {
      onChange(
        empty
          ? value.filter((_, i) => i !== existing.index)
          : value.map((entry, i) => (i === existing.index ? { ...entry, ...next } : entry)),
      );
    } else if (!empty) {
      onChange(ordered([...value, { ...next, role }]));
    }
  };

  const primaryLabel = (position: number): string =>
    type === 'marriage'
      ? t(position === 0 ? 'records.roleGroom' : 'records.roleBride')
      : t(roleLabelKey(type, primary));

  const multiLabelKey: Record<string, MessageKey> = {
    godparent: type === 'sidi' ? 'records.addMentor' : 'records.addGodparent',
    witness: 'records.addWitness',
    other: type === 'death' ? 'records.addFamily' : 'records.addOther',
  };

  return (
    <div className="flex flex-col gap-5">
      {peopleErrors?.message ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {peopleErrors.message}
        </p>
      ) : null}
      <div className={cn('grid gap-4', type === 'marriage' && 'sm:grid-cols-2')}>
        {ofRole(primary).map(({ entry, index }, position) => (
          <PersonField
            key={`primary-${position}`}
            id={`record-person-${index}`}
            label={primaryLabel(position)}
            required
            value={entry}
            error={errorAt(index)}
            onChange={(next) => update(index, next)}
            onPicked={onPicked}
          />
        ))}
      </div>

      {roles.includes('father') && type !== 'marriage' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {(['father', 'mother'] as const).map((role) => {
            const current = ofRole(role)[0];
            return (
              <PersonField
                key={role}
                id={`record-${role}`}
                label={t(roleLabelKey(type, role))}
                value={current?.entry ?? { personId: null, name: null }}
                error={current ? errorAt(current.index) : undefined}
                onChange={(next) => setSingle(role, next)}
              />
            );
          })}
        </div>
      ) : null}

      {MULTI_ROLES.filter((role) => roles.includes(role)).map((role) => {
        const items = ofRole(role);
        if (items.length === 0) return null;
        return (
          <div key={role} className="flex flex-col gap-3">
            {items.map(({ entry, index }, position) => (
              <PersonField
                key={`${role}-${position}`}
                id={`record-person-${index}`}
                label={`${t(roleLabelKey(type, role))} ${items.length > 1 ? position + 1 : ''}`.trim()}
                value={entry}
                error={errorAt(index)}
                onChange={(next) => update(index, next)}
                onRemove={() => remove(index)}
              />
            ))}
          </div>
        );
      })}
      {value.length < RECORDS_LIMITS.peoplePerRecordMax ? (
        <div className="flex flex-wrap gap-2">
          {MULTI_ROLES.filter((role) => roles.includes(role)).map((role) => (
            <Button key={role} type="button" variant="outline" size="sm" onClick={() => add(role)}>
              {role === 'witness' ? <UserRoundPlus /> : <Plus />}
              {t(multiLabelKey[role]!)}
            </Button>
          ))}
        </div>
      ) : null}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileText className="size-3.5" />
        {t('records.peopleSnapshotHint')}
      </p>
    </div>
  );
}
