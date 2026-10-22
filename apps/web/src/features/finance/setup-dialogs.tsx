import {
  FINANCE_ACCOUNT_TYPES,
  FINANCE_ACCOUNT_TYPE_LABELS,
  FINANCE_CATEGORY_KINDS,
  FINANCE_CATEGORY_KIND_LABELS,
  financeAccountInputSchema,
  financeCategoryInputSchema,
  financeFundInputSchema,
  localize,
  type FinanceAccount,
  type FinanceAccountInput,
  type FinanceCategory,
  type FinanceCategoryInput,
  type FinanceCategoryKind,
  type FinanceFund,
  type FinanceFundInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { accounts, categories, funds, useFinanceDefaults } from './api';
import { todayIn } from './helpers';

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** The suggested Kas Umum / Pembangunan / Misi / Diakonia funds, categories and a cash box. */
export function DefaultsDialog({ open, onOpenChange }: DialogProps) {
  const { t } = useI18n();
  const { churchId, church } = useChurch();
  const [opening, setOpening] = useState<number | null>(0);
  const save = useMutationToast(useFinanceDefaults(churchId), {
    success: t('finance.setupDone'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('finance.setupStart')}</DialogTitle>
          <DialogDescription>{t('finance.setupDialogDescription')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save
              .run({ openingDate: todayIn(church.timezone), cashOpeningBalance: opening ?? 0 })
              .then((result) => {
                if (result) onOpenChange(false);
              });
          }}
        >
          <ul className="grid gap-1.5 rounded-xl bg-muted/60 p-3.5 text-sm">
            <li>{t('finance.setupFunds')}</li>
            <li>{t('finance.setupCategories')}</li>
            <li>{t('finance.setupCash')}</li>
          </ul>
          <Field
            label={t('finance.cashOpening')}
            htmlFor="defaults-opening"
            description={t('finance.cashOpeningHint')}
          >
            <CurrencyInput id="defaults-opening" value={opening} onChange={setOpening} autoFocus />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('finance.setupConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FundForm = z.input<typeof financeFundInputSchema>;

export function FundDialog({ open, onOpenChange, fund }: DialogProps & { fund?: FinanceFund }) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const form = useForm<FundForm, unknown, FinanceFundInput>({
    resolver: zodResolver(financeFundInputSchema),
    values: {
      name: fund?.name ?? '',
      code: fund?.code ?? '',
      description: fund?.description ?? '',
      isRestricted: fund?.isRestricted ?? false,
      isActive: fund?.isActive ?? true,
      sortOrder: fund?.sortOrder ?? 0,
    },
  });
  const save = useMutationToast(funds.useSave(churchId), {
    success: (data) => t('finance.fundSaved', { name: data.fund.name }),
    form,
  });
  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fund ? t('finance.editFund') : t('finance.newFund')}</DialogTitle>
          <DialogDescription>{t('finance.fundDialogDescription')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex min-h-0 flex-col gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            if (await save.run({ ...values, id: fund?.id })) onOpenChange(false);
          })}
        >
          <DialogBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Field
                label={t('finance.name')}
                htmlFor="fund-name"
                error={errors.name?.message}
                required
              >
                <Input
                  id="fund-name"
                  autoFocus
                  aria-invalid={!!errors.name}
                  {...form.register('name')}
                />
              </Field>
              <Field label={t('finance.code')} htmlFor="fund-code" error={errors.code?.message}>
                <Input id="fund-code" {...form.register('code')} />
              </Field>
            </div>
            <Field label={t('finance.descriptionField')} htmlFor="fund-description">
              <Textarea
                id="fund-description"
                className="min-h-20"
                {...form.register('description')}
              />
            </Field>
            <Controller
              control={form.control}
              name="isRestricted"
              render={({ field }) => (
                <ToggleRow
                  id="fund-restricted"
                  label={t('finance.restricted')}
                  description={t('finance.restrictedHint')}
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <ToggleRow
                  id="fund-active"
                  label={t('finance.active')}
                  description={t('finance.activeHint')}
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type AccountForm = z.input<typeof financeAccountInputSchema>;

export function AccountDialog({
  open,
  onOpenChange,
  account,
}: DialogProps & { account?: FinanceAccount }) {
  const { t, locale } = useI18n();
  const { churchId, church } = useChurch();
  const form = useForm<AccountForm, unknown, FinanceAccountInput>({
    resolver: zodResolver(financeAccountInputSchema),
    values: {
      name: account?.name ?? '',
      type: account?.type ?? 'bank',
      bankName: account?.bankName ?? '',
      accountNumber: account?.accountNumber ?? '',
      openingBalance: account?.openingBalance ?? 0,
      openingDate: account?.openingDate ?? todayIn(church.timezone),
      isActive: account?.isActive ?? true,
    },
  });
  const save = useMutationToast(accounts.useSave(churchId), {
    success: (data) => t('finance.accountSaved', { name: data.account.name }),
    form,
  });
  const errors = form.formState.errors;
  const type = useWatch({ control: form.control, name: 'type' });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? t('finance.editAccount') : t('finance.newAccount')}</DialogTitle>
          <DialogDescription>{t('finance.accountDialogDescription')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex min-h-0 flex-col gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            if (await save.run({ ...values, id: account?.id })) onOpenChange(false);
          })}
        >
          <DialogBody className="flex flex-col gap-4">
            <Field
              label={t('finance.name')}
              htmlFor="account-name"
              error={errors.name?.message}
              required
            >
              <Input
                id="account-name"
                autoFocus
                aria-invalid={!!errors.name}
                {...form.register('name')}
              />
            </Field>
            <Field label={t('finance.accountType')} htmlFor="account-type">
              <Select id="account-type" {...form.register('type')}>
                {FINANCE_ACCOUNT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {localize(FINANCE_ACCOUNT_TYPE_LABELS[value], locale)}
                  </option>
                ))}
              </Select>
            </Field>
            {type !== 'cash' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('finance.bankName')} htmlFor="account-bank">
                  <Input
                    id="account-bank"
                    placeholder="BCA, BRI, Mandiri…"
                    {...form.register('bankName')}
                  />
                </Field>
                <Field
                  label={t('finance.accountNumber')}
                  htmlFor="account-number"
                  error={errors.accountNumber?.message}
                >
                  <Input
                    id="account-number"
                    inputMode="numeric"
                    {...form.register('accountNumber')}
                  />
                </Field>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="openingBalance"
                render={({ field }) => (
                  <Field
                    label={t('finance.openingBalance')}
                    htmlFor="account-opening"
                    error={errors.openingBalance?.message}
                  >
                    <CurrencyInput
                      id="account-opening"
                      value={field.value ?? 0}
                      onChange={(value) => field.onChange(value ?? 0)}
                    />
                  </Field>
                )}
              />
              <Field
                label={t('finance.openingDate')}
                htmlFor="account-opening-date"
                error={errors.openingDate?.message}
              >
                <Input id="account-opening-date" type="date" {...form.register('openingDate')} />
              </Field>
            </div>
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <ToggleRow
                  id="account-active"
                  label={t('finance.active')}
                  description={t('finance.activeHint')}
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type CategoryForm = z.input<typeof financeCategoryInputSchema>;

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  kind = 'expense',
}: DialogProps & { category?: FinanceCategory; kind?: FinanceCategoryKind }) {
  const { t, locale } = useI18n();
  const { churchId } = useChurch();
  const form = useForm<CategoryForm, unknown, FinanceCategoryInput>({
    resolver: zodResolver(financeCategoryInputSchema),
    values: {
      kind: category?.kind ?? kind,
      name: category?.name ?? '',
      code: category?.code ?? '',
      isActive: category?.isActive ?? true,
      sortOrder: category?.sortOrder ?? 0,
    },
  });
  const save = useMutationToast(categories.useSave(churchId), {
    success: (data) => t('finance.categorySaved', { name: data.category.name }),
    form,
  });
  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {category ? t('finance.editCategory') : t('finance.newCategory')}
          </DialogTitle>
          <DialogDescription>{t('finance.categoryDialogDescription')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex min-h-0 flex-col gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            if (await save.run({ ...values, id: category?.id })) onOpenChange(false);
          })}
        >
          <DialogBody className="flex flex-col gap-4">
            <Field label={t('finance.categoryKind')} htmlFor="category-kind">
              <Select id="category-kind" {...form.register('kind')}>
                {FINANCE_CATEGORY_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {localize(FINANCE_CATEGORY_KIND_LABELS[value], locale)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Field
                label={t('finance.name')}
                htmlFor="category-name"
                error={errors.name?.message}
                required
              >
                <Input
                  id="category-name"
                  autoFocus
                  aria-invalid={!!errors.name}
                  {...form.register('name')}
                />
              </Field>
              <Field label={t('finance.code')} htmlFor="category-code" error={errors.code?.message}>
                <Input id="category-code" placeholder="5.1" {...form.register('code')} />
              </Field>
            </div>
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <ToggleRow
                  id="category-active"
                  label={t('finance.active')}
                  description={t('finance.activeHint')}
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A labelled switch row inside dialogs and forms. */
export function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 p-3.5">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description ? (
          <span className="block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
