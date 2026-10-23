import {
  CONTRIBUTION_KINDS,
  CONTRIBUTION_KIND_CATEGORY,
  CONTRIBUTION_KIND_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  financeContributionInputSchema,
  hasAny,
  localize,
  type ContributionKind,
  type FinanceContribution,
  type FinanceContributionInput,
  type PaymentMethod,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { HeartHandshake } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert, Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { campaignsQuery, contributionQuery, useSaveContribution } from './api';
import { PersonCombobox } from './components';
import { todayIn, useFinanceSetup, withCurrent, useFinanceResolver } from './helpers';

type FormValues = z.input<typeof financeContributionInputSchema>;
type DonorMode = 'person' | 'name' | 'anonymous';

export function NewContributionPage() {
  const { t } = useI18n();
  const { base } = useChurch();
  return (
    <Page size="narrow">
      <PageHeader
        icon={HeartHandshake}
        tone="teal"
        title={t('finance.recordGift')}
        description={t('finance.recordGiftDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navGiving'), to: `${base}/finance/giving` },
          { label: t('finance.recordGift') },
        ]}
      />
      <ContributionFormLoader />
    </Page>
  );
}

export function EditContributionPage() {
  const { t } = useI18n();
  const { base, churchId } = useChurch();
  const { contributionId = '' } = useParams();
  const query = useQuery(contributionQuery(churchId, contributionId));
  const detail = `${base}/finance/giving/${contributionId}`;
  return (
    <Page size="narrow">
      <PageHeader
        title={t('finance.correctGift')}
        description={t('finance.correctGiftDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navGiving'), to: `${base}/finance/giving` },
          { label: t('finance.receipt'), to: detail },
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
      ) : query.data.contribution.voidedAt ? (
        <Alert variant="warning" title={t('finance.voidedTitle')}>
          {query.data.contribution.voidReason}
        </Alert>
      ) : (
        <ContributionFormLoader contribution={query.data.contribution} />
      )}
    </Page>
  );
}

function ContributionFormLoader({ contribution }: { contribution?: FinanceContribution }) {
  const setup = useFinanceSetup();
  if (setup.query.isPending)
    return <SkeletonCards count={2} className="sm:grid-cols-1 lg:grid-cols-1" />;
  if (setup.query.isError) {
    return (
      <ErrorState
        error={setup.query.error}
        message={getErrorMessage(setup.query.error)}
        onRetry={() => void setup.query.refetch()}
      />
    );
  }
  return <ContributionForm contribution={contribution} />;
}

function ContributionForm({ contribution }: { contribution?: FinanceContribution }) {
  const { t, locale } = useI18n();
  const { church, churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const setup = useFinanceSetup();
  const campaigns = useQuery({
    ...campaignsQuery(churchId),
    enabled: hasAny(access, ['finance.view', 'finance.record', 'finance.reports']),
  });
  const allCampaigns = campaigns.data?.items ?? [];
  const campaignOptions = withCurrent(
    allCampaigns.filter((campaign) => campaign.status === 'active'),
    allCampaigns,
    contribution?.campaignId,
  );
  const fundOptions = withCurrent(setup.activeFunds, setup.funds, contribution?.fundId);
  const accountOptions = withCurrent(setup.activeAccounts, setup.accounts, contribution?.accountId);
  const categoryOptions = withCurrent(
    setup.incomeCategories,
    setup.categories,
    contribution?.categoryId,
  );
  const [mode, setMode] = useState<DonorMode>(
    contribution
      ? contribution.person
        ? 'person'
        : contribution.donorName
          ? 'name'
          : 'anonymous'
      : 'person',
  );
  const categoryFor = (kind: ContributionKind) =>
    setup.incomeCategories.find((category) => category.name === CONTRIBUTION_KIND_CATEGORY[kind])
      ?.id ?? null;
  const defaults = (previous?: Partial<FormValues>): FormValues => ({
    personId: null,
    donorName: '',
    kind: previous?.kind ?? 'tithe',
    fundId: previous?.fundId ?? setup.activeFunds[0]?.id ?? '',
    accountId:
      previous?.accountId ??
      setup.activeAccounts.find((account) => account.type === 'bank')?.id ??
      setup.activeAccounts[0]?.id ??
      '',
    categoryId: previous?.categoryId ?? categoryFor(previous?.kind ?? 'tithe'),
    campaignId: null,
    method: previous?.method ?? 'transfer',
    amount: 0,
    receivedAt: previous?.receivedAt ?? todayIn(church.timezone),
    reference: '',
    note: '',
  });
  const form = useForm<FormValues, unknown, FinanceContributionInput>({
    resolver: useFinanceResolver(zodResolver(financeContributionInputSchema)),
    defaultValues: contribution
      ? {
          personId: contribution.person?.id ?? null,
          donorName: contribution.donorName ?? '',
          kind: contribution.kind,
          fundId: contribution.fundId,
          accountId: contribution.accountId,
          categoryId: contribution.categoryId,
          campaignId: contribution.campaignId,
          method: contribution.method,
          amount: contribution.amount,
          receivedAt: contribution.receivedAt,
          reference: contribution.reference ?? '',
          note: contribution.note ?? '',
        }
      : defaults(),
  });
  const values = useWatch({ control: form.control });
  const errors = form.formState.errors;
  const { isDirty, isSubmitting } = form.formState;
  const [saved, setSaved] = useState(false);
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !saved);
  const save = useMutationToast(useSaveContribution(churchId), {
    success: (data) =>
      contribution
        ? t('finance.giftCorrected')
        : t('finance.giftRecorded', { receipt: data.contribution.receiptNumber ?? '' }),
    form,
  });

  const submit = (again: boolean) =>
    form.handleSubmit(async (parsed) => {
      const body = {
        ...parsed,
        personId: mode === 'person' ? parsed.personId : null,
        donorName: mode === 'name' ? parsed.donorName : null,
      };
      if (mode === 'person' && !body.personId) {
        form.setError('personId', { message: t('finance.choosePersonError') });
        return;
      }
      const result = await save.run({ ...body, id: contribution?.id });
      if (!result) return;
      if (again) {
        form.reset(defaults(parsed));
        document.getElementById('gift-amount')?.focus();
      } else {
        setSaved(true);
        navigate(`${base}/finance/giving/${result.contribution.id}`, { replace: true });
      }
    });

  const showReference = values.method === 'transfer' || values.method === 'qris';

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => void submit(false)(event)}
    >
      {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field
            label={t('finance.giver')}
            htmlFor="gift-person"
            error={errors.personId?.message ?? errors.donorName?.message}
          >
            <Segmented<DonorMode>
              aria-label={t('finance.giver')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'person', label: t('finance.giverMember') },
                { value: 'name', label: t('finance.giverName') },
                { value: 'anonymous', label: t('finance.giverAnonymous') },
              ]}
            />
          </Field>
          {mode === 'person' ? (
            <Controller
              control={form.control}
              name="personId"
              render={({ field }) => (
                <PersonCombobox
                  id="gift-person"
                  value={field.value ?? null}
                  selected={contribution?.person ?? null}
                  invalid={!!errors.personId}
                  onChange={(value) => field.onChange(value)}
                />
              )}
            />
          ) : mode === 'name' ? (
            <Input
              id="gift-name"
              aria-label={t('finance.giverName')}
              placeholder={t('finance.giverNamePlaceholder')}
              {...form.register('donorName')}
            />
          ) : (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              {t('finance.anonymousHint')}
            </p>
          )}
          <Controller
            control={form.control}
            name="amount"
            render={({ field }) => (
              <Field
                label={t('finance.amount')}
                htmlFor="gift-amount"
                error={errors.amount?.message}
                required
              >
                <CurrencyInput
                  id="gift-amount"
                  autoFocus={!contribution}
                  value={field.value || null}
                  onChange={(value) => field.onChange(value ?? 0)}
                  aria-invalid={!!errors.amount}
                  className="h-14 text-xl"
                />
              </Field>
            )}
          />
          <Field label={t('finance.kind')} htmlFor="gift-kind">
            <Select
              id="gift-kind"
              {...form.register('kind', {
                onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                  form.setValue('categoryId', categoryFor(event.target.value as ContributionKind)),
              })}
            >
              {CONTRIBUTION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {localize(CONTRIBUTION_KIND_LABELS[kind], locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Controller
            control={form.control}
            name="method"
            render={({ field }) => (
              <Field label={t('finance.method')}>
                <Segmented<PaymentMethod>
                  aria-label={t('finance.method')}
                  value={(field.value ?? 'transfer') as PaymentMethod}
                  onChange={field.onChange}
                  options={PAYMENT_METHODS.map((value) => ({
                    value,
                    label: localize(PAYMENT_METHOD_LABELS[value], locale),
                  }))}
                />
              </Field>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('finance.receivedAt')}
              htmlFor="gift-date"
              error={errors.receivedAt?.message}
              required
            >
              <Input
                id="gift-date"
                type="date"
                {...form.register('receivedAt')}
                aria-invalid={!!errors.receivedAt}
              />
            </Field>
            {showReference ? (
              <Field
                label={t('finance.reference')}
                htmlFor="gift-reference"
                description={t('finance.referenceHint')}
              >
                <Input id="gift-reference" {...form.register('reference')} />
              </Field>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('finance.fund')} htmlFor="gift-fund" error={errors.fundId?.message}>
              <Select id="gift-fund" {...form.register('fundId')}>
                {fundOptions.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t('finance.account')}
              htmlFor="gift-account"
              error={errors.accountId?.message}
            >
              <Select id="gift-account" {...form.register('accountId')}>
                {accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <Field label={t('finance.category')} htmlFor="gift-category">
                  <Select
                    id="gift-category"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                  >
                    <option value="">{t('finance.noCategory')}</option>
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            />
            {campaignOptions.length > 0 ? (
              <Controller
                control={form.control}
                name="campaignId"
                render={({ field }) => (
                  <Field label={t('finance.campaign')} htmlFor="gift-campaign">
                    <Select
                      id="gift-campaign"
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value || null)}
                    >
                      <option value="">{t('finance.noCampaign')}</option>
                      {campaignOptions.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              />
            ) : null}
          </div>
          <Field label={t('finance.notes')} htmlFor="gift-note">
            <Textarea id="gift-note" className="min-h-20" {...form.register('note')} />
          </Field>
        </CardContent>
      </Card>

      <FormActions>
        {!contribution ? (
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={(event) => void submit(true)(event)}
          >
            {t('finance.saveAndAddAnother')}
          </Button>
        ) : null}
        <Button type="submit" loading={save.isPending}>
          {contribution ? t('common.saveChanges') : t('finance.saveGift')}
        </Button>
      </FormActions>
      {guard}
    </form>
  );
}
