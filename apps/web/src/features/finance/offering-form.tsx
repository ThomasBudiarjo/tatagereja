import {
  IDR_DENOMINATIONS,
  OFFERING_DEFAULT_CATEGORY,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  denominationTotal,
  localize,
  offeringBatchInputSchema,
  type OfferingBatch,
  type OfferingBatchInput,
  type PaymentMethod,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Calculator, Minus, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert, Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Stepper } from '@/components/ui/stepper';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useAuth } from '@/stores/auth';
import { useSaveOffering } from './api';
import { MemberCombobox, MethodLabel, Money } from './components';
import { ToggleRow } from './setup-dialogs';
import { lastSunday, todayIn, useFinanceSetup } from './helpers';

type FormValues = z.input<typeof offeringBatchInputSchema>;
type LineValues = FormValues['lines'][number];

const SERVICE_SUGGESTIONS = ['Ibadah Umum 1', 'Ibadah Umum 2', 'Ibadah Pemuda', 'Sekolah Minggu'];

const STEP_FIELDS = [
  ['serviceDate', 'serviceLabel', 'accountId', 'counter1Name', 'counter2Name', 'counter2UserId'],
  ['lines'],
  ['notes'],
] as const;

/**
 * The Sunday counting flow: who counted which service, then each bag or envelope type per fund
 * (cash with a banknote counter, or a transfer/QRIS total), then a review before submitting it
 * for verification. Built for a phone held in one hand.
 */
export function OfferingForm({
  batch,
  onSaved,
}: {
  batch?: OfferingBatch;
  onSaved: (batch: OfferingBatch) => void;
}) {
  const { t, currency } = useI18n();
  const { church, churchId } = useChurch();
  const { user } = useAuth();
  const setup = useFinanceSetup();
  const [step, setStep] = useState(0);
  const isIdr = currency === 'IDR';
  const defaultCategory =
    setup.incomeCategories.find((c) => c.name === OFFERING_DEFAULT_CATEGORY)?.id ?? null;
  const defaultFund = setup.activeFunds[0]?.id ?? '';
  const defaultAccount =
    setup.activeAccounts.find((account) => account.type === 'cash')?.id ??
    setup.activeAccounts[0]?.id ??
    '';

  const emptyLine = (method: PaymentMethod = 'cash'): LineValues => ({
    fundId: defaultFund,
    categoryId: defaultCategory,
    method,
    amount: 0,
    denominations: {},
    note: '',
  });

  const form = useForm<FormValues, unknown, OfferingBatchInput>({
    resolver: zodResolver(offeringBatchInputSchema),
    defaultValues: batch
      ? {
          serviceDate: batch.serviceDate,
          worshipServiceId: batch.worshipServiceId,
          serviceLabel: batch.serviceLabel ?? '',
          accountId: batch.accountId,
          counter1UserId: batch.counter1UserId,
          counter1Name: batch.counter1UserId ? '' : (batch.counter1Name ?? ''),
          counter2UserId: batch.counter2UserId,
          counter2Name: batch.counter2UserId ? '' : (batch.counter2Name ?? ''),
          notes: batch.notes ?? '',
          lines: batch.lines.map((line) => ({
            fundId: line.fundId,
            categoryId: line.categoryId,
            method: line.method,
            amount: line.amount,
            denominations: line.denominations,
            note: line.note ?? '',
          })),
          submit: false,
        }
      : {
          serviceDate: lastSunday(todayIn(church.timezone)),
          serviceLabel: 'Ibadah Umum 1',
          accountId: defaultAccount,
          counter1UserId: user?.id ?? null,
          counter1Name: '',
          counter2UserId: null,
          counter2Name: '',
          notes: '',
          lines: [emptyLine('cash')],
          submit: false,
        },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const save = useMutationToast(useSaveOffering(churchId), {
    success: (_data, variables) =>
      variables.submit ? t('finance.offeringSubmitted') : t('finance.offeringSaved'),
    form,
  });
  const pending = save.isPending;
  const values = useWatch({ control: form.control });
  const errors = form.formState.errors;
  const { isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful);
  const total = (values.lines ?? []).reduce((sum, line) => sum + (line?.amount ?? 0), 0);
  const [counter1Mode, setCounter1Mode] = useState<'me' | 'member' | 'name'>(
    !batch || batch.counter1UserId === user?.id ? 'me' : batch.counter1UserId ? 'member' : 'name',
  );
  const [counter2Mode, setCounter2Mode] = useState<'member' | 'name'>(
    batch?.counter2UserId ? 'member' : 'name',
  );

  const steps = [
    { id: 'service', label: t('finance.stepService') },
    { id: 'count', label: t('finance.stepCount') },
    { id: 'review', label: t('finance.stepReview') },
  ];

  const next = async () => {
    const valid = await form.trigger([...(STEP_FIELDS[step] ?? [])] as (keyof FormValues)[]);
    if (step === 1 && total <= 0) {
      form.setError('lines', { message: t('finance.enterAnAmount') });
      return;
    }
    if (valid) {
      setStep((current) => Math.min(2, current + 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const submit = (submitForVerification: boolean) =>
    form.handleSubmit(
      async (parsed) => {
        const saved = await save.run({
          ...parsed,
          id: batch?.id,
          counter1UserId: counter1Mode === 'name' ? null : parsed.counter1UserId,
          counter1Name: counter1Mode === 'name' ? parsed.counter1Name : null,
          counter2UserId: counter2Mode === 'name' ? null : parsed.counter2UserId,
          counter2Name: counter2Mode === 'name' ? parsed.counter2Name : null,
          submit: submitForVerification,
        });
        if (saved) onSaved(saved.batch);
        else {
          const firstStep = STEP_FIELDS.findIndex((fields) =>
            fields.some((field) => field in form.formState.errors),
          );
          if (firstStep >= 0) setStep(firstStep);
        }
      },
      (invalid) => {
        const firstStep = STEP_FIELDS.findIndex((fields) =>
          fields.some((field) => field in invalid),
        );
        if (firstStep >= 0) setStep(firstStep);
      },
    );

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (step < 2) void next();
        else void submit(true)(event);
      }}
    >
      <Stepper steps={steps} current={step} onStepClick={setStep} />
      {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}

      {step === 0 ? (
        <div className="flex animate-rise-in flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('finance.serviceDate')}
                  htmlFor="offering-date"
                  error={errors.serviceDate?.message}
                  required
                >
                  <Input
                    id="offering-date"
                    type="date"
                    autoFocus
                    aria-invalid={!!errors.serviceDate}
                    {...form.register('serviceDate')}
                  />
                </Field>
                <Field
                  label={t('finance.account')}
                  htmlFor="offering-account"
                  error={errors.accountId?.message}
                  required
                >
                  <Select
                    id="offering-account"
                    aria-invalid={!!errors.accountId}
                    {...form.register('accountId')}
                  >
                    {setup.activeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field
                label={t('finance.serviceLabel')}
                htmlFor="offering-label"
                error={errors.serviceLabel?.message}
              >
                <Input
                  id="offering-label"
                  placeholder="Ibadah Umum 1"
                  {...form.register('serviceLabel')}
                />
              </Field>
              <div className="-mt-2 flex flex-wrap gap-1.5">
                {SERVICE_SUGGESTIONS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => form.setValue('serviceLabel', label, { shouldDirty: true })}
                    className={cn(
                      'h-9 rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                      values.serviceLabel === label
                        ? 'border-primary/30 bg-accent text-accent-foreground'
                        : 'border-input bg-card hover:bg-muted',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="font-semibold">{t('finance.counters')}</p>
                <p className="text-sm text-muted-foreground">{t('finance.countersHint')}</p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">{t('finance.counter1')}</p>
                <Segmented
                  aria-label={t('finance.counter1')}
                  value={counter1Mode}
                  onChange={(mode) => {
                    setCounter1Mode(mode);
                    form.setValue('counter1UserId', mode === 'me' ? (user?.id ?? null) : null, {
                      shouldDirty: true,
                    });
                    form.setValue('counter1Name', '', { shouldDirty: true });
                  }}
                  options={[
                    { value: 'me', label: t('finance.counterMe') },
                    { value: 'member', label: t('finance.counterMember') },
                    { value: 'name', label: t('finance.counterName') },
                  ]}
                />
                {counter1Mode === 'me' ? (
                  <p className="text-sm text-muted-foreground">{user?.name}</p>
                ) : counter1Mode === 'member' ? (
                  <Controller
                    control={form.control}
                    name="counter1UserId"
                    render={({ field }) => (
                      <MemberCombobox
                        id="counter1-member"
                        value={field.value ?? null}
                        onChange={(userId) => field.onChange(userId)}
                        selectedName={
                          batch?.counter1UserId === field.value ? batch?.counter1Name : null
                        }
                        excludeUserId={values.counter2UserId ?? null}
                      />
                    )}
                  />
                ) : (
                  <Input
                    id="counter1-name"
                    aria-label={t('finance.counter1')}
                    placeholder={t('finance.counterNamePlaceholder')}
                    {...form.register('counter1Name')}
                  />
                )}
                {errors.counter1Name ? (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {errors.counter1Name.message}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">{t('finance.counter2')}</p>
                <Segmented
                  aria-label={t('finance.counter2')}
                  value={counter2Mode}
                  onChange={(mode) => {
                    setCounter2Mode(mode);
                    form.setValue('counter2UserId', null, { shouldDirty: true });
                    form.setValue('counter2Name', '', { shouldDirty: true });
                  }}
                  options={[
                    { value: 'member', label: t('finance.counterMember') },
                    { value: 'name', label: t('finance.counterName') },
                  ]}
                />
                {counter2Mode === 'member' ? (
                  <Controller
                    control={form.control}
                    name="counter2UserId"
                    render={({ field }) => (
                      <MemberCombobox
                        id="counter2-member"
                        value={field.value ?? null}
                        onChange={(userId) => field.onChange(userId)}
                        selectedName={
                          batch?.counter2UserId === field.value ? batch?.counter2Name : null
                        }
                        excludeUserId={values.counter1UserId ?? null}
                      />
                    )}
                  />
                ) : (
                  <Input
                    id="counter2-name"
                    aria-label={t('finance.counter2')}
                    aria-invalid={!!errors.counter2Name}
                    placeholder={t('finance.counterNamePlaceholder')}
                    {...form.register('counter2Name')}
                  />
                )}
                {errors.counter2Name || errors.counter2UserId ? (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {errors.counter2Name?.message ?? errors.counter2UserId?.message}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex animate-rise-in flex-col gap-4">
          {lines.fields.map((line, index) => (
            <LineCard
              key={line.id}
              index={index}
              control={form.control}
              register={form.register}
              isIdr={isIdr}
              canRemove={lines.fields.length > 1}
              onRemove={() => lines.remove(index)}
              setAmount={(amount) =>
                form.setValue(`lines.${index}.amount`, amount, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              error={errors.lines?.[index]?.amount?.message}
            />
          ))}
          {errors.lines?.message || errors.lines?.root?.message ? (
            <Alert variant="error">{errors.lines.message ?? errors.lines.root?.message}</Alert>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => lines.append(emptyLine('cash'))}>
              <Plus />
              {t('finance.addCash')}
            </Button>
            <Button type="button" variant="outline" onClick={() => lines.append(emptyLine('qris'))}>
              <Plus />
              {t('finance.addNonCash')}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex animate-rise-in flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-muted-foreground">{t('finance.totalCounted')}</p>
                <Money value={total} className="text-2xl" />
              </div>
              <ul className="divide-y divide-border/60 text-sm">
                {(values.lines ?? []).map((line, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {setup.funds.find((fund) => fund.id === line?.fundId)?.name ?? '—'}
                      </span>
                      <MethodLabel
                        method={(line?.method ?? 'cash') as PaymentMethod}
                        className="text-xs text-muted-foreground"
                      />
                    </span>
                    <Money value={line?.amount ?? 0} />
                  </li>
                ))}
              </ul>
              <dl className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">{t('finance.serviceLabel')}</dt>
                  <dd className="font-medium">{values.serviceLabel || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('finance.account')}</dt>
                  <dd className="font-medium">
                    {setup.accounts.find((account) => account.id === values.accountId)?.name ?? '—'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Field
            label={t('finance.notes')}
            htmlFor="offering-notes"
            description={t('finance.notesHint')}
          >
            <Textarea id="offering-notes" {...form.register('notes')} />
          </Field>
          <Alert variant="info">{t('finance.verifyExplainer')}</Alert>
        </div>
      ) : null}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-2xl border border-border/70 bg-card/95 p-3 shadow-raised backdrop-blur md:bottom-4">
        <div className={cn('min-w-0 flex-1', step === 2 && 'max-sm:hidden')}>
          <p className="text-overline text-muted-foreground">{t('finance.total')}</p>
          <Money value={total} className="text-lg" />
        </div>
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={t('common.back')}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft />
          </Button>
        ) : null}
        {step < 2 ? (
          <Button type="submit" size="lg">
            {t('common.next')}
            <ArrowRight />
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="hidden sm:inline-flex"
              disabled={pending}
              onClick={(event) => void submit(false)(event)}
            >
              {t('finance.saveDraft')}
            </Button>
            <Button type="submit" size="lg" loading={pending} className="max-sm:flex-1">
              {!pending ? <Send /> : null}
              {t('finance.submitForVerification')}
            </Button>
          </>
        )}
      </div>
      {step === 2 ? (
        <Button
          type="button"
          variant="ghost"
          className="sm:hidden"
          disabled={pending}
          onClick={(event) => void submit(false)(event)}
        >
          {t('finance.saveDraft')}
        </Button>
      ) : null}
      {guard}
    </form>
  );
}

function LineCard({
  index,
  control,
  register,
  isIdr,
  canRemove,
  onRemove,
  setAmount,
  error,
}: {
  index: number;
  control: Control<FormValues>;
  register: ReturnType<typeof useForm<FormValues, unknown, OfferingBatchInput>>['register'];
  isIdr: boolean;
  canRemove: boolean;
  onRemove: () => void;
  setAmount: (amount: number) => void;
  error?: string;
}) {
  const { t, locale } = useI18n();
  const setup = useFinanceSetup();
  const line = useWatch({ control, name: `lines.${index}` });
  const method = (line?.method ?? 'cash') as PaymentMethod;
  const [byNotes, setByNotes] = useState(
    isIdr && (Object.keys(line?.denominations ?? {}).length > 0 || (line?.amount ?? 0) === 0),
  );
  return (
    <Card className="animate-rise-in">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">{t('finance.lineTitle', { number: index + 1 })}</p>
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('finance.removeLine')}
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('finance.fund')} htmlFor={`line-${index}-fund`}>
            <Select id={`line-${index}-fund`} {...register(`lines.${index}.fundId`)}>
              {setup.activeFunds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </Select>
          </Field>
          <Controller
            control={control}
            name={`lines.${index}.categoryId`}
            render={({ field }) => (
              <Field label={t('finance.category')} htmlFor={`line-${index}-category`}>
                <Select
                  id={`line-${index}-category`}
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value || null)}
                >
                  <option value="">{t('finance.noCategory')}</option>
                  {setup.incomeCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          />
        </div>
        <Controller
          control={control}
          name={`lines.${index}.method`}
          render={({ field }) => (
            <Segmented<PaymentMethod>
              aria-label={t('finance.method')}
              value={(field.value ?? 'cash') as PaymentMethod}
              onChange={(value) => {
                field.onChange(value);
                if (value !== 'cash') setByNotes(false);
              }}
              options={PAYMENT_METHODS.map((value) => ({
                value,
                label: localize(PAYMENT_METHOD_LABELS[value], locale),
              }))}
            />
          )}
        />
        {method === 'cash' && isIdr ? (
          <ToggleRow
            id={`line-${index}-notes`}
            label={t('finance.countByNotes')}
            description={t('finance.countByNotesHint')}
            checked={byNotes}
            onCheckedChange={(checked) => setByNotes(checked)}
          />
        ) : null}
        {method === 'cash' && byNotes ? (
          <Controller
            control={control}
            name={`lines.${index}.denominations`}
            render={({ field }) => (
              <DenominationCounter
                idPrefix={`line-${index}`}
                value={(field.value ?? {}) as Record<string, number>}
                onChange={(denominations) => {
                  field.onChange(denominations);
                  setAmount(denominationTotal(denominations));
                }}
              />
            )}
          />
        ) : (
          <Controller
            control={control}
            name={`lines.${index}.amount`}
            render={({ field }) => (
              <Field label={t('finance.amount')} htmlFor={`line-${index}-amount`} error={error}>
                <CurrencyInput
                  id={`line-${index}-amount`}
                  value={field.value ?? 0}
                  onChange={(value) => {
                    field.onChange(value ?? 0);
                  }}
                  className="h-14 text-xl"
                />
              </Field>
            )}
          />
        )}
        {method === 'cash' && byNotes && error ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Input
          aria-label={t('finance.lineNote')}
          placeholder={t('finance.lineNotePlaceholder')}
          {...register(`lines.${index}.note`)}
        />
      </CardContent>
    </Card>
  );
}

/** Banknotes and coins with large steppers and a numeric keypad for the count. */
function DenominationCounter({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: Record<string, number>;
  onChange: (value: Record<string, number>) => void;
}) {
  const { t, formatCurrency, formatNumber } = useI18n();
  const set = (denomination: number, count: number) => {
    const next = { ...value };
    if (count > 0) next[String(denomination)] = count;
    else delete next[String(denomination)];
    onChange(next);
  };
  const total = denominationTotal(value);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Calculator className="size-4 text-muted-foreground" aria-hidden />
        {t('finance.denominations')}
      </div>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
        {IDR_DENOMINATIONS.map((denomination) => {
          const count = value[String(denomination)] ?? 0;
          const inputId = `${idPrefix}-d${denomination}`;
          return (
            <li
              key={denomination}
              className={cn(
                'flex items-center gap-2 px-3 py-2 transition-colors',
                count > 0 && 'bg-tone-soft/40',
              )}
              data-tone="emerald"
            >
              <label htmlFor={inputId} className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold tabular">
                  {formatCurrency(denomination)}
                </span>
                <span className="min-h-4 truncate text-xs text-muted-foreground tabular">
                  {count > 0 ? `= ${formatCurrency(count * denomination)}` : ''}
                </span>
              </label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label={t('finance.decrease', { value: formatCurrency(denomination) })}
                  disabled={count === 0}
                  onClick={() => set(denomination, count - 1)}
                >
                  <Minus />
                </Button>
                <Input
                  id={inputId}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="next"
                  className="h-11 w-16 text-center text-base font-semibold tabular"
                  value={count === 0 ? '' : String(count)}
                  placeholder="0"
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
                    set(denomination, digits ? Number(digits) : 0);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label={t('finance.increase', { value: formatCurrency(denomination) })}
                  onClick={() => set(denomination, count + 1)}
                >
                  <Plus />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {t('finance.notesCounted', {
            count: formatNumber(Object.values(value).reduce((sum, item) => sum + item, 0)),
          })}
        </span>
        <span className="font-semibold tabular">{formatCurrency(total)}</span>
      </p>
    </div>
  );
}
