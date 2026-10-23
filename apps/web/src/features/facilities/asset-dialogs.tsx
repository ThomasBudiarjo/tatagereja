import {
  ASSET_CONDITIONS,
  ASSET_CONDITION_LABELS,
  MAINTENANCE_KINDS,
  MAINTENANCE_KIND_LABELS,
  assetMaintenanceInputSchema,
  checkOutAssetBodySchema,
  localize,
  returnAssetBodySchema,
  type AssetLoan,
  type InventoryAsset,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useCheckOutAsset, useLogMaintenance, useReturnAsset } from './api';
import { shiftDate, todayIn } from './facilities-lib';
import { PersonPicker } from './facilities-ui';

type CheckOutInput = z.input<typeof checkOutAssetBodySchema>;
type CheckOutOutput = z.output<typeof checkOutAssetBodySchema>;

/** Lend an asset to a person in the directory, or to anyone by name. */
export function CheckOutSheet({
  asset,
  open,
  onOpenChange,
}: {
  asset: InventoryAsset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId, church } = useChurch();
  const { t, locale } = useI18n();
  const today = todayIn(church.timezone);
  const [mode, setMode] = useState<'person' | 'name'>('person');
  const form = useForm<CheckOutInput, unknown, CheckOutOutput>({
    resolver: zodResolver(checkOutAssetBodySchema),
    defaultValues: {
      borrowerPersonId: null,
      borrowerName: '',
      groupId: null,
      dueDate: shiftDate(today, 7),
      conditionOut: asset.condition,
      notes: '',
    },
  });
  const { errors } = form.formState;
  const lend = useMutationToast(useCheckOutAsset(churchId, asset.id), {
    success: (result) => t('facilities.lentTo', { name: result.loan.borrowerName }),
    form,
  });
  const close = (next: boolean) => {
    if (!next) form.reset();
    onOpenChange(next);
  };
  const submit = form.handleSubmit(async (values) => {
    const body =
      mode === 'person'
        ? { ...values, borrowerName: null }
        : { ...values, borrowerPersonId: null };
    if (await lend.run(body)) close(false);
  });

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('facilities.checkOutTitle', { name: asset.name })}</SheetTitle>
          <SheetDescription>{t('facilities.checkOutBody')}</SheetDescription>
        </SheetHeader>
        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col gap-4" noValidate>
          <SheetBody className="flex flex-col gap-4">
            <Segmented
              aria-label={t('facilities.borrower')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'person', label: t('facilities.borrowerPerson') },
                { value: 'name', label: t('facilities.borrowerOther') },
              ]}
            />
            {mode === 'person' ? (
              <Controller
                control={form.control}
                name="borrowerPersonId"
                render={({ field }) => (
                  <Field
                    label={t('facilities.borrower')}
                    htmlFor="loan-person"
                    error={errors.borrowerPersonId?.message}
                    required
                  >
                    <PersonPicker
                      id="loan-person"
                      value={field.value ?? null}
                      onChange={field.onChange}
                      invalid={!!errors.borrowerPersonId}
                    />
                  </Field>
                )}
              />
            ) : (
              <Field
                label={t('facilities.borrowerName')}
                htmlFor="loan-name"
                error={errors.borrowerName?.message ?? errors.borrowerPersonId?.message}
                description={t('facilities.borrowerNameHint')}
                required
              >
                <Input id="loan-name" autoFocus {...form.register('borrowerName')} />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('facilities.fieldDueDate')} htmlFor="loan-due" error={errors.dueDate?.message}>
                <Input id="loan-due" type="date" min={today} {...form.register('dueDate')} />
              </Field>
              <Controller
                control={form.control}
                name="conditionOut"
                render={({ field }) => (
                  <Field label={t('facilities.fieldConditionOut')} htmlFor="loan-condition">
                    <Select
                      id="loan-condition"
                      value={field.value ?? asset.condition}
                      onChange={(event) => field.onChange(event.target.value)}
                    >
                      {ASSET_CONDITIONS.map((condition) => (
                        <option key={condition} value={condition}>
                          {localize(ASSET_CONDITION_LABELS[condition], locale)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              />
            </div>
            <Field label={t('facilities.fieldNotes')} htmlFor="loan-notes" error={errors.notes?.message}>
              <Textarea
                id="loan-notes"
                rows={2}
                placeholder={t('facilities.loanNotesPlaceholder')}
                {...form.register('notes')}
              />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={lend.isPending}>
              {t('facilities.checkOut')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type ReturnInput = z.input<typeof returnAssetBodySchema>;
type ReturnOutput = z.output<typeof returnAssetBodySchema>;

/** Take an asset back and record the condition it came back in. */
export function ReturnSheet({
  loan,
  open,
  onOpenChange,
}: {
  loan: Pick<AssetLoan, 'id' | 'assetName' | 'borrowerName' | 'conditionOut'> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t, locale } = useI18n();
  const form = useForm<ReturnInput, unknown, ReturnOutput>({
    resolver: zodResolver(returnAssetBodySchema),
    values: { conditionIn: loan?.conditionOut ?? 'good', notes: '' },
  });
  const giveBack = useMutationToast(useReturnAsset(churchId), {
    success: (result) => t('facilities.returned', { name: result.loan.assetName }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    if (!loan) return;
    if (await giveBack.run({ loanId: loan.id, ...values })) onOpenChange(false);
  });
  return (
    <Sheet open={open && !!loan} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('facilities.returnTitle', { name: loan?.assetName ?? '' })}</SheetTitle>
          <SheetDescription>
            {t('facilities.returnBody', { name: loan?.borrowerName ?? '' })}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col gap-4" noValidate>
          <SheetBody className="flex flex-col gap-4">
            <Controller
              control={form.control}
              name="conditionIn"
              render={({ field }) => (
                <Field label={t('facilities.fieldConditionIn')}>
                  <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {ASSET_CONDITIONS.map((condition) => (
                      <button
                        key={condition}
                        type="button"
                        role="radio"
                        aria-checked={field.value === condition}
                        onClick={() => field.onChange(condition)}
                        className="h-11 rounded-lg border border-input bg-card text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-checked:border-primary aria-checked:bg-primary/10 aria-checked:text-primary"
                      >
                        {localize(ASSET_CONDITION_LABELS[condition], locale)}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            />
            {form.watch('conditionIn') === 'broken' ? (
              <p className="text-sm text-muted-foreground">{t('facilities.brokenGoesToMaintenance')}</p>
            ) : null}
            <Field label={t('facilities.fieldNotes')} htmlFor="return-notes" error={form.formState.errors.notes?.message}>
              <Textarea id="return-notes" rows={2} {...form.register('notes')} />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={giveBack.isPending}>
              {t('facilities.markReturned')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type MaintenanceInput = z.input<typeof assetMaintenanceInputSchema>;
type MaintenanceOutput = z.output<typeof assetMaintenanceInputSchema>;

/** Log an inspection, repair or service, with its cost and when it is due again. */
export function MaintenanceSheet({
  asset,
  open,
  onOpenChange,
}: {
  asset: InventoryAsset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId, church } = useChurch();
  const { t, locale } = useI18n();
  const today = todayIn(church.timezone);
  const form = useForm<MaintenanceInput, unknown, MaintenanceOutput>({
    resolver: zodResolver(assetMaintenanceInputSchema),
    defaultValues: {
      date: today,
      kind: 'service',
      description: '',
      cost: null,
      performedBy: '',
      nextDueDate: '',
    },
  });
  const { errors } = form.formState;
  const log = useMutationToast(useLogMaintenance(churchId, asset.id), {
    success: t('facilities.maintenanceLogged'),
    form,
  });
  const close = (next: boolean) => {
    if (!next) form.reset();
    onOpenChange(next);
  };
  const submit = form.handleSubmit(async (values) => {
    if (await log.run(values)) close(false);
  });
  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('facilities.logMaintenanceTitle')}</SheetTitle>
          <SheetDescription>
            {asset.code} · {asset.name}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col gap-4" noValidate>
          <SheetBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('facilities.fieldDate')} htmlFor="maint-date" error={errors.date?.message} required>
                <Input id="maint-date" type="date" max={today} {...form.register('date')} />
              </Field>
              <Field label={t('facilities.fieldMaintenanceKind')} htmlFor="maint-kind">
                <Select id="maint-kind" {...form.register('kind')}>
                  {MAINTENANCE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {localize(MAINTENANCE_KIND_LABELS[kind], locale)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label={t('facilities.fieldWhatWasDone')}
              htmlFor="maint-description"
              error={errors.description?.message}
              required
            >
              <Textarea
                id="maint-description"
                rows={3}
                autoFocus
                placeholder={t('facilities.maintenancePlaceholder')}
                aria-invalid={!!errors.description}
                {...form.register('description')}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Controller
                control={form.control}
                name="cost"
                render={({ field }) => (
                  <Field label={t('facilities.fieldCost')} htmlFor="maint-cost" error={errors.cost?.message}>
                    <CurrencyInput id="maint-cost" value={field.value ?? null} onChange={field.onChange} />
                  </Field>
                )}
              />
              <Field label={t('facilities.fieldPerformedBy')} htmlFor="maint-by">
                <Input id="maint-by" {...form.register('performedBy')} />
              </Field>
            </div>
            <Field
              label={t('facilities.fieldNextDueDate')}
              htmlFor="maint-next"
              error={errors.nextDueDate?.message}
              description={t('facilities.nextDueHint')}
            >
              <Input id="maint-next" type="date" min={today} {...form.register('nextDueDate')} />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={log.isPending}>
              {t('facilities.saveMaintenance')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
