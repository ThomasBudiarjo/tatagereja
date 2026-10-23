import {
  FINANCE_LIMITS,
  canEditExpense,
  expenseRequestInputSchema,
  type ExpenseRequest,
  type ExpenseRequestInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Link2, Plus, Receipt, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { expenseQuery, useSaveExpense } from './api';
import { PersonCombobox } from './components';
import { useFinanceSetup, withCurrent, useFinanceResolver } from './helpers';
import { ToggleRow } from './setup-dialogs';

type FormValues = z.input<typeof expenseRequestInputSchema>;

export function NewExpensePage() {
  const { t } = useI18n();
  const { base } = useChurch();
  return (
    <Page size="narrow">
      <PageHeader
        icon={Receipt}
        tone="rose"
        title={t('finance.newExpense')}
        description={t('finance.newExpenseDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navExpenses'), to: `${base}/finance/expenses` },
          { label: t('finance.newExpense') },
        ]}
      />
      <ExpenseFormLoader />
    </Page>
  );
}

export function EditExpensePage() {
  const { t } = useI18n();
  const { base, churchId, access } = useChurch();
  const { expenseId = '' } = useParams();
  const query = useQuery(expenseQuery(churchId, expenseId));
  const detail = `${base}/finance/expenses/${expenseId}`;
  return (
    <Page size="narrow">
      <PageHeader
        title={t('finance.editExpense')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navExpenses'), to: `${base}/finance/expenses` },
          { label: query.data?.expense.title ?? t('finance.expenseDetail'), to: detail },
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
      ) : !canEditExpense(access, query.data.expense) ? (
        <Alert
          variant="warning"
          title={t('finance.expenseLocked')}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to={detail}>{t('common.back')}</Link>
            </Button>
          }
        >
          {t('finance.expenseLockedHint')}
        </Alert>
      ) : (
        <ExpenseFormLoader expense={query.data.expense} />
      )}
    </Page>
  );
}

function ExpenseFormLoader({ expense }: { expense?: ExpenseRequest }) {
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
  return <ExpenseForm expense={expense} />;
}

function ExpenseForm({ expense }: { expense?: ExpenseRequest }) {
  const { t } = useI18n();
  const { churchId, base } = useChurch();
  const navigate = useNavigate();
  const setup = useFinanceSetup();
  const [saved, setSaved] = useState(false);
  const form = useForm<FormValues, unknown, ExpenseRequestInput>({
    resolver: useFinanceResolver(zodResolver(expenseRequestInputSchema)),
    defaultValues: {
      title: expense?.title ?? '',
      description: expense?.description ?? '',
      categoryId: expense?.categoryId ?? setup.expenseCategories[0]?.id ?? '',
      fundId: expense?.fundId ?? setup.activeFunds[0]?.id ?? '',
      amount: expense?.amount ?? 0,
      payeeName: expense?.payeeName ?? '',
      neededBy: expense?.neededBy ?? '',
      attachmentUrls: expense?.attachmentUrls ?? [],
      isReimbursement: expense?.isReimbursement ?? false,
      reimbursePersonId: expense?.reimbursePerson?.id ?? null,
      submit: false,
    },
  });
  const errors = form.formState.errors;
  const values = useWatch({ control: form.control });
  const { isDirty, isSubmitting } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !saved);
  const [attachment, setAttachment] = useState('');
  const save = useMutationToast(useSaveExpense(churchId), {
    success: (data) =>
      data.expense.status === 'submitted'
        ? t('finance.expenseSubmitted')
        : t('finance.expenseSaved'),
    form,
  });
  const attachments = values.attachmentUrls ?? [];
  const selectedFund = setup.funds.find((fund) => fund.id === values.fundId);

  const submit = (submitForApproval: boolean) =>
    form.handleSubmit(async (parsed) => {
      const result = await save.run({ ...parsed, id: expense?.id, submit: submitForApproval });
      if (result) {
        setSaved(true);
        navigate(`${base}/finance/expenses/${result.expense.id}`, { replace: true });
      }
    });

  const addAttachment = () => {
    const value = attachment.trim();
    if (!value) return;
    form.setValue('attachmentUrls', [...attachments, value], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setAttachment('');
  };

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(true)(event)}>
      {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field
            label={t('finance.expenseTitle')}
            htmlFor="expense-title"
            error={errors.title?.message}
            required
          >
            <Input
              id="expense-title"
              autoFocus
              placeholder={t('finance.expenseTitlePlaceholder')}
              aria-invalid={!!errors.title}
              {...form.register('title')}
            />
          </Field>
          <Controller
            control={form.control}
            name="amount"
            render={({ field }) => (
              <Field
                label={t('finance.amount')}
                htmlFor="expense-amount"
                error={errors.amount?.message}
                required
              >
                <CurrencyInput
                  id="expense-amount"
                  value={field.value || null}
                  onChange={(value) => field.onChange(value ?? 0)}
                  aria-invalid={!!errors.amount}
                  className="h-14 text-xl"
                />
              </Field>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('finance.category')}
              htmlFor="expense-category"
              error={errors.categoryId?.message}
              required
            >
              <Select id="expense-category" {...form.register('categoryId')}>
                {withCurrent(setup.expenseCategories, setup.categories, expense?.categoryId).map(
                  (category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ),
                )}
              </Select>
            </Field>
            <Field
              label={t('finance.fund')}
              htmlFor="expense-fund"
              error={errors.fundId?.message}
              description={selectedFund?.isRestricted ? t('finance.restrictedWarning') : undefined}
            >
              <Select id="expense-fund" {...form.register('fundId')}>
                {withCurrent(setup.activeFunds, setup.funds, expense?.fundId).map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label={t('finance.descriptionField')}
            htmlFor="expense-description"
            description={t('finance.expenseDescriptionHint')}
          >
            <Textarea id="expense-description" {...form.register('description')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Controller
            control={form.control}
            name="isReimbursement"
            render={({ field }) => (
              <ToggleRow
                id="expense-reimbursement"
                label={t('finance.reimbursement')}
                description={t('finance.reimbursementHint')}
                checked={!!field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          {values.isReimbursement ? (
            <Controller
              control={form.control}
              name="reimbursePersonId"
              render={({ field }) => (
                <Field
                  label={t('finance.reimbursePerson')}
                  htmlFor="expense-person"
                  error={errors.reimbursePersonId?.message}
                  required
                >
                  <PersonCombobox
                    id="expense-person"
                    value={field.value ?? null}
                    selected={expense?.reimbursePerson ?? null}
                    invalid={!!errors.reimbursePersonId}
                    onChange={(value) => field.onChange(value)}
                  />
                </Field>
              )}
            />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('finance.payee')}
              htmlFor="expense-payee"
              description={values.isReimbursement ? t('finance.payeeReimbursementHint') : undefined}
            >
              <Input id="expense-payee" {...form.register('payeeName')} />
            </Field>
            <Field
              label={t('finance.neededBy')}
              htmlFor="expense-needed"
              error={errors.neededBy?.message}
            >
              <Input id="expense-needed" type="date" {...form.register('neededBy')} />
            </Field>
          </div>
          <Field
            label={t('finance.attachments')}
            htmlFor="expense-attachment"
            error={errors.attachmentUrls?.message ?? errors.attachmentUrls?.[0]?.message}
            description={t('finance.attachmentsHint')}
          >
            <div className="flex gap-2">
              <Input
                id="expense-attachment"
                type="url"
                inputMode="url"
                placeholder="https://drive.google.com/…"
                value={attachment}
                onChange={(event) => setAttachment(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addAttachment();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label={t('finance.addAttachment')}
                disabled={attachments.length >= FINANCE_LIMITS.attachmentsMax}
                onClick={addAttachment}
              >
                <Plus />
              </Button>
            </div>
          </Field>
          {attachments.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {attachments.map((url, index) => (
                <li
                  key={`${url}-${index}`}
                  className="flex items-center gap-2 rounded-lg bg-muted/60 py-1 pr-1 pl-3 text-sm"
                >
                  <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{url}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('finance.removeAttachment')}
                    onClick={() =>
                      form.setValue(
                        'attachmentUrls',
                        attachments.filter((_, position) => position !== index),
                        { shouldDirty: true, shouldValidate: true },
                      )
                    }
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Alert variant="info">{t('finance.approvalExplainer')}</Alert>
      <FormActions>
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={(event) => void submit(false)(event)}
        >
          {t('finance.saveDraft')}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {!save.isPending ? <Send /> : null}
          {t('finance.submitForApproval')}
        </Button>
      </FormActions>
      {guard}
    </form>
  );
}
