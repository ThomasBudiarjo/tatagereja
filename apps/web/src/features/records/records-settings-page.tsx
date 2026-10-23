import {
  DEFAULT_RECORD_NUMBER_PATTERNS,
  REGISTRY_RECORD_TYPES,
  REGISTRY_RECORD_TYPE_LABELS,
  formatRecordNumber,
  localize,
  numberPatternSchema,
  recordsSettingsSchema,
  type RecordsSettings,
  type RegistryRecordType,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FormActions } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { settingsQuery, useSaveRecordsSettings } from './api';
import { RECORDS_TONE, RECORD_TYPE_META, useIssueText, yearNow } from './records-lib';
import { RecordNumber, RecordsNav } from './records-ui';

/** The form edits every pattern as a plain string; empty means "use the default". */
type FormValues = {
  numberPatterns: Record<RegistryRecordType, string>;
  signatoryName: string;
  signatoryTitle: string;
  certificateFooter: string;
};
type FormOutput = z.output<typeof recordsSettingsSchema>;

const TOKENS: readonly (readonly [string, MessageKey])[] = [
  ['{YYYY}', 'records.tokenYear'],
  ['{YY}', 'records.tokenShortYear'],
  ['{NNN}', 'records.tokenSequence'],
  ['{TYPE}', 'records.tokenType'],
];

const PATTERN_FIELDS = REGISTRY_RECORD_TYPES.map((type) => `numberPatterns.${type}`);

/** Number patterns of the register books and the certificate signatory. */
export function RecordsSettingsPage() {
  const { churchId } = useChurch();
  const query = useQuery(settingsQuery(churchId));
  if (query.isPending) {
    return (
      <Page>
        <SkeletonText lines={14} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      </Page>
    );
  }
  return <SettingsForm settings={query.data.settings} nextNumbers={query.data.nextNumbers} />;
}

function SettingsForm({
  settings,
  nextNumbers,
}: {
  settings: RecordsSettings;
  nextNumbers: Record<RegistryRecordType, string>;
}) {
  const { churchId, base, church } = useChurch();
  const { t, locale } = useI18n();
  const issueText = useIssueText();
  const navigate = useNavigate();
  const year = yearNow(church.timezone);
  const form = useForm<FormValues, unknown, FormOutput>({
    // Empty patterns fall back to the defaults; the shared schema checks the rest.
    resolver: async (values, context, options) => {
      const numberPatterns = Object.fromEntries(
        Object.entries(values.numberPatterns).filter(([, pattern]) => pattern.trim() !== ''),
      );
      const resolve = zodResolver(recordsSettingsSchema);
      return resolve({ ...values, numberPatterns }, context, options as never) as never;
    },
    defaultValues: {
      numberPatterns: Object.fromEntries(
        REGISTRY_RECORD_TYPES.map((type) => [type, settings.numberPatterns[type] ?? '']),
      ) as Record<RegistryRecordType, string>,
      signatoryName: settings.signatoryName ?? '',
      signatoryTitle: settings.signatoryTitle ?? '',
      certificateFooter: settings.certificateFooter ?? '',
    },
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting);
  const save = useMutationToast(useSaveRecordsSettings(churchId), {
    success: t('records.settingsSaved'),
    form: form as never,
    fields: [...PATTERN_FIELDS, 'signatoryName', 'signatoryTitle', 'certificateFooter'],
  });
  const patterns = useWatch({ control: form.control, name: 'numberPatterns' });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (result) {
      form.reset({
        numberPatterns: Object.fromEntries(
          REGISTRY_RECORD_TYPES.map((type) => [type, result.settings.numberPatterns[type] ?? '']),
        ) as Record<RegistryRecordType, string>,
        signatoryName: result.settings.signatoryName ?? '',
        signatoryTitle: result.settings.signatoryTitle ?? '',
        certificateFooter: result.settings.certificateFooter ?? '',
      });
    }
  });

  return (
    <Page>
      <PageHeader
        title={t('records.settingsTitle')}
        description={t('records.settingsDescription')}
        icon={Settings2}
        tone={RECORDS_TONE}
        breadcrumbs={[
          { label: t('records.nav'), to: `${base}/records` },
          { label: t('records.settingsTitle') },
        ]}
      />
      <RecordsNav />
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>{t('records.patternsTitle')}</CardTitle>
            <CardDescription>{t('records.patternsHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {TOKENS.map(([token, key]) => (
                <li key={token} className="flex items-center gap-1.5">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                    {token}
                  </code>
                  {t(key)}
                </li>
              ))}
            </ul>
            <div className="grid gap-4 sm:grid-cols-2">
              {REGISTRY_RECORD_TYPES.map((type, index) => {
                const meta = RECORD_TYPE_META[type];
                const value = patterns[type]?.trim() || DEFAULT_RECORD_NUMBER_PATTERNS[type];
                const valid = numberPatternSchema.safeParse(value).success;
                const unchanged = (settings.numberPatterns[type] ?? '') === (patterns[type] ?? '');
                const example = valid
                  ? unchanged
                    ? nextNumbers[type]
                    : formatRecordNumber(value, { type, year, sequence: 1 })
                  : null;
                const error = issueText(errors.numberPatterns?.[type]?.message);
                return (
                  <Field
                    key={type}
                    label={
                      <span className="flex items-center gap-2">
                        <meta.icon className="size-4 text-muted-foreground" aria-hidden />
                        {localize(REGISTRY_RECORD_TYPE_LABELS[type], locale)}
                      </span>
                    }
                    htmlFor={`pattern-${type}`}
                    error={error}
                  >
                    <Input
                      id={`pattern-${type}`}
                      autoFocus={index === 0}
                      placeholder={DEFAULT_RECORD_NUMBER_PATTERNS[type]}
                      className="font-mono"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={!!error}
                      {...form.register(`numberPatterns.${type}`)}
                    />
                    {example && !error ? (
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {unchanged ? t('records.nextNumber') : t('records.example')}
                        <RecordNumber number={example} />
                      </span>
                    ) : null}
                  </Field>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('records.certificateTitle')}</CardTitle>
            <CardDescription>{t('records.certificateHint')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('records.fieldSignatoryName')}
              htmlFor="signatory-name"
              error={errors.signatoryName?.message}
            >
              <Input
                id="signatory-name"
                placeholder="Pdt. ..."
                {...form.register('signatoryName')}
              />
            </Field>
            <Field
              label={t('records.fieldSignatoryTitle')}
              htmlFor="signatory-title"
              error={errors.signatoryTitle?.message}
            >
              <Input
                id="signatory-title"
                placeholder={t('records.signatoryTitlePlaceholder')}
                {...form.register('signatoryTitle')}
              />
            </Field>
            <Field
              label={t('records.fieldCertificateFooter')}
              htmlFor="certificate-footer"
              error={errors.certificateFooter?.message}
              className="sm:col-span-2"
            >
              <Input id="certificate-footer" {...form.register('certificateFooter')} />
            </Field>
          </CardContent>
        </Card>

        <FormActions>
          <Button type="button" variant="ghost" onClick={() => void navigate(-1)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!isDirty}>
            {t('common.saveChanges')}
          </Button>
        </FormActions>
        {guard}
      </form>
    </Page>
  );
}
