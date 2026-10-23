import {
  CARE_CATEGORIES,
  CARE_CATEGORY_LABELS,
  CARE_PRIORITIES,
  CARE_PRIORITY_LABELS,
  CARE_STATUSES,
  CARE_STATUS_LABELS,
  careCaseInputSchema,
  isCareTeam,
  localize,
  type CareCase,
  type CareCaseInput,
  type CareConfidentiality,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { HandHeart, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { caseQuery, useSaveCase } from './api';
import { HouseholdCombobox, MemberCombobox, PersonCombobox } from './components';

type FormValues = z.input<typeof careCaseInputSchema> & { closedReason?: string | null };

export function NewCasePage() {
  const { t } = useI18n();
  const { base } = useChurch();
  return (
    <Page size="narrow">
      <PageHeader
        icon={HandHeart}
        tone="rose"
        title={t('care.newCase')}
        description={t('care.newCaseDescription')}
        breadcrumbs={[
          { label: t('care.nav'), to: `${base}/care` },
          { label: t('care.navCases'), to: `${base}/care/cases` },
          { label: t('care.newCase') },
        ]}
      />
      <CaseForm />
    </Page>
  );
}

export function EditCasePage() {
  const { t } = useI18n();
  const { base, churchId } = useChurch();
  const { caseId = '' } = useParams();
  const query = useQuery(caseQuery(churchId, caseId));
  const detail = `${base}/care/cases/${caseId}`;
  return (
    <Page size="narrow">
      <PageHeader
        title={t('care.editCase')}
        breadcrumbs={[
          { label: t('care.nav'), to: `${base}/care` },
          { label: t('care.navCases'), to: `${base}/care/cases` },
          { label: query.data?.case.title ?? t('care.caseDetail'), to: detail },
          { label: t('common.edit') },
        ]}
      />
      {query.isPending ? (
        <SkeletonCards count={2} className="sm:grid-cols-1 lg:grid-cols-1" />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data.case.canManage ? (
        <Alert
          variant="warning"
          title={t('care.caseReadOnly')}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to={detail}>{t('common.back')}</Link>
            </Button>
          }
        >
          {t('care.caseReadOnlyHint')}
        </Alert>
      ) : (
        <CaseForm careCase={query.data.case} />
      )}
    </Page>
  );
}

const LEVELS: {
  value: CareConfidentiality;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: MessageKey;
  hintKey: MessageKey;
}[] = [
  {
    value: 'normal',
    icon: ShieldCheck,
    labelKey: 'care.careTeam',
    hintKey: 'care.confidentialityNormalHint',
  },
  {
    value: 'confidential',
    icon: Lock,
    labelKey: 'care.confidential',
    hintKey: 'care.confidentialityConfidentialHint',
  },
];

/** Two radio cards: the care team, or confidential. */
export function ConfidentialityPicker({
  value,
  onChange,
  lockLower = false,
  name,
}: {
  value: CareConfidentiality;
  onChange: (value: CareConfidentiality) => void;
  /** A confidential record the caller may not lower. */
  lockLower?: boolean;
  name: string;
}) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t('care.whoCanRead')} className="grid gap-2 sm:grid-cols-2">
      {LEVELS.map((level) => {
        const selected = value === level.value;
        const disabled = lockLower && level.value === 'normal' && value === 'confidential';
        return (
          <label
            key={level.value}
            data-tone={level.value === 'confidential' ? 'danger' : 'info'}
            className={cn(
              'flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30',
              selected ? 'border-tone bg-tone-soft/50' : 'border-border/80 hover:bg-muted/50',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name={name}
              value={level.value}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(level.value)}
              className="sr-only"
            />
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-tone-soft text-tone-ink">
              <level.icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t(level.labelKey)}</span>
              <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">
                {t(level.hintKey)}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function CaseForm({ careCase }: { careCase?: CareCase }) {
  const { t, locale } = useI18n();
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [saved, setSaved] = useState(false);
  const presetCategory = search.get('category');
  const form = useForm<FormValues, unknown, CareCaseInput>({
    resolver: zodResolver(careCaseInputSchema),
    defaultValues: {
      personId: careCase ? (careCase.person?.id ?? null) : search.get('personId'),
      householdId: careCase?.household?.id ?? null,
      category:
        careCase?.category ??
        CARE_CATEGORIES.find((category) => category === presetCategory) ??
        'visitation',
      priority: careCase?.priority ?? 'normal',
      status: careCase?.status ?? 'open',
      confidentiality: careCase?.confidentiality ?? 'normal',
      title: careCase?.title ?? '',
      description: careCase?.description ?? '',
      nextActionDate: careCase?.nextActionDate ?? '',
      nextActionNote: careCase?.nextActionNote ?? '',
      caregiverUserIds: [],
      closedReason: careCase?.closedReason ?? '',
    },
  });
  const errors = form.formState.errors;
  const status = useWatch({ control: form.control, name: 'status' });
  const confidentiality = useWatch({ control: form.control, name: 'confidentiality' });
  const { isDirty, isSubmitting } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !saved);
  const save = useMutationToast(useSaveCase(churchId), {
    success: careCase ? t('care.caseSaved') : t('care.caseCreated'),
    form,
  });
  const onSubmit = form.handleSubmit(async (values) => {
    const { caregiverUserIds, ...rest } = values;
    const body = careCase
      ? { ...rest, id: careCase.id, closedReason: form.getValues('closedReason') ?? null }
      : { ...rest, caregiverUserIds };
    const result = await save.run(body);
    if (result) {
      setSaved(true);
      navigate(`${base}/care/cases/${result.case.id}`, { replace: true });
    }
  });

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
      {guard}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field
            label={t('care.caseTitle')}
            htmlFor="case-title"
            error={errors.title?.message}
            description={t('care.caseTitleHint')}
            required
          >
            <Input
              id="case-title"
              autoFocus
              placeholder={t('care.caseTitlePlaceholder')}
              aria-invalid={!!errors.title}
              {...form.register('title')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="personId"
              render={({ field }) => (
                <Field
                  label={t('care.person')}
                  htmlFor="case-person"
                  error={errors.personId?.message}
                >
                  <PersonCombobox
                    id="case-person"
                    value={field.value ?? null}
                    selected={careCase?.person}
                    invalid={!!errors.personId}
                    onChange={(value) => field.onChange(value)}
                  />
                </Field>
              )}
            />
            {isCareTeam(access) ? (
              <Controller
                control={form.control}
                name="householdId"
                render={({ field }) => (
                  <Field label={t('care.household')} htmlFor="case-household">
                    <HouseholdCombobox
                      id="case-household"
                      value={field.value ?? null}
                      selected={careCase?.household}
                      onChange={field.onChange}
                    />
                  </Field>
                )}
              />
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('care.category')}
              htmlFor="case-category"
              error={errors.category?.message}
            >
              <Select id="case-category" {...form.register('category')}>
                {CARE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {localize(CARE_CATEGORY_LABELS[value], locale)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('care.priority')} htmlFor="case-priority">
              <Select id="case-priority" {...form.register('priority')}>
                {CARE_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {localize(CARE_PRIORITY_LABELS[value], locale)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {careCase ? (
            <Field label={t('care.status')} htmlFor="case-status">
              <Select id="case-status" {...form.register('status')}>
                {CARE_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {localize(CARE_STATUS_LABELS[value], locale)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {status === 'closed' ? (
            <Field label={t('care.closedReason')} htmlFor="case-closed-reason">
              <Input
                id="case-closed-reason"
                placeholder={t('care.closedReasonPlaceholder')}
                {...form.register('closedReason')}
              />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field label={t('care.whoCanRead')} error={errors.confidentiality?.message}>
            <Controller
              control={form.control}
              name="confidentiality"
              render={({ field }) => (
                <ConfidentialityPicker
                  name="case-confidentiality"
                  value={field.value ?? 'normal'}
                  onChange={field.onChange}
                  lockLower={!!careCase && !careCase.canLowerConfidentiality}
                />
              )}
            />
          </Field>
          {careCase && !careCase.canLowerConfidentiality && confidentiality === 'confidential' ? (
            <p className="text-xs text-muted-foreground">{t('care.lowerLocked')}</p>
          ) : null}
          <Field
            label={t('care.situation')}
            htmlFor="case-description"
            error={errors.description?.message}
            description={t('care.situationHint')}
          >
            <Textarea
              id="case-description"
              rows={5}
              placeholder={t('care.situationPlaceholder')}
              {...form.register('description')}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_1fr]">
            <Field
              label={t('care.nextActionDate')}
              htmlFor="case-next-date"
              error={errors.nextActionDate?.message}
            >
              <Input
                id="case-next-date"
                type="date"
                aria-invalid={!!errors.nextActionDate}
                {...form.register('nextActionDate')}
              />
            </Field>
            <Field
              label={t('care.nextStep')}
              htmlFor="case-next-note"
              error={errors.nextActionNote?.message}
            >
              <Input
                id="case-next-note"
                placeholder={t('care.nextStepPlaceholder')}
                {...form.register('nextActionNote')}
              />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t('care.reminderHint')}</p>
          {!careCase ? (
            <Controller
              control={form.control}
              name="caregiverUserIds"
              render={({ field }) => (
                <Field
                  label={t('care.caregivers')}
                  htmlFor="case-caregivers"
                  description={
                    confidentiality === 'confidential'
                      ? t('care.caregiversConfidentialHint')
                      : t('care.caregiversHint')
                  }
                >
                  <MemberCombobox
                    id="case-caregivers"
                    multiple
                    everyone
                    value={field.value ?? []}
                    onChange={field.onChange}
                  />
                </Field>
              )}
            />
          ) : null}
        </CardContent>
      </Card>

      <FormActions>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            navigate(careCase ? `${base}/care/cases/${careCase.id}` : `${base}/care/cases`)
          }
        >
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {careCase ? t('common.saveChanges') : t('care.openCase')}
        </Button>
      </FormActions>
    </form>
  );
}
