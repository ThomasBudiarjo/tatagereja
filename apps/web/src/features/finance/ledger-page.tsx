import {
  FINANCE_ENTRY_SOURCES,
  FINANCE_ENTRY_SOURCE_LABELS,
  financeAdjustmentInputSchema,
  financeTransferInputSchema,
  has,
  localize,
  type FinanceAdjustmentInput,
  type FinanceTransferInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, BookOpen, Download, SlidersHorizontal, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DateRangePicker } from '@/components/ui/date-range-picker';
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
import { FilterBar } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Select } from '@/components/ui/select';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { TabsContent, TabsList, TabsTrigger, UrlTabs } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import {
  csvUrl,
  downloadCsv,
  entriesQuery,
  transfersQuery,
  useSaveAdjustment,
  useSaveTransfer,
  useVoidEntry,
  useVoidTransfer,
  type EntryListParams,
} from './api';
import { FinanceNav, Money, ReasonDialog } from './components';
import {
  compactRange,
  SOURCE_ICON,
  SOURCE_TONE,
  sourcePath,
  todayIn,
  useFinanceSetup,
} from './helpers';

const PAGE_SIZE = 50;

export function LedgerPage() {
  const { t } = useI18n();
  const { base, access } = useChurch();
  const canManage = has(access, 'finance.manage');
  const [dialog, setDialog] = useState<'adjust' | 'transfer' | null>(null);
  return (
    <Page size="wide">
      <PageHeader
        icon={BookOpen}
        tone="emerald"
        title={t('finance.navLedger')}
        description={t('finance.ledgerDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navLedger') },
        ]}
        actions={
          canManage ? (
            <>
              <Button variant="outline" onClick={() => setDialog('transfer')}>
                <ArrowLeftRight />
                <span className="max-sm:sr-only">{t('finance.newTransfer')}</span>
              </Button>
              <Button variant="outline" onClick={() => setDialog('adjust')}>
                <SlidersHorizontal />
                <span className="max-sm:sr-only">{t('finance.newAdjustment')}</span>
              </Button>
            </>
          ) : null
        }
      />
      <FinanceNav />
      <UrlTabs defaultValue="entries" values={['entries', 'transfers']}>
        <TabsList variant="underline">
          <TabsTrigger value="entries">{t('finance.entries')}</TabsTrigger>
          <TabsTrigger value="transfers">{t('finance.transfers')}</TabsTrigger>
        </TabsList>
        <TabsContent value="entries" className="flex flex-col gap-4">
          <EntriesTab />
        </TabsContent>
        <TabsContent value="transfers" className="flex flex-col gap-4">
          <TransfersTab />
        </TabsContent>
      </UrlTabs>
      <AdjustmentDialog
        open={dialog === 'adjust'}
        onOpenChange={(open) => setDialog(open ? 'adjust' : null)}
      />
      <TransferDialog
        open={dialog === 'transfer'}
        onOpenChange={(open) => setDialog(open ? 'transfer' : null)}
      />
    </Page>
  );
}

function EntriesTab() {
  const { t, locale, formatDate } = useI18n();
  const { churchId, base, access } = useChurch();
  const setup = useFinanceSetup();
  const [state, setState, reset] = useUrlState({
    q: '',
    accountId: '',
    fundId: '',
    sourceType: '',
    direction: '',
    from: '',
    to: '',
    voided: '',
    page: 1,
  });
  const params: EntryListParams = {
    q: state.q || undefined,
    accountId: state.accountId || undefined,
    fundId: state.fundId || undefined,
    sourceType: (state.sourceType || undefined) as EntryListParams['sourceType'],
    direction: (state.direction || undefined) as EntryListParams['direction'],
    from: state.from || undefined,
    to: state.to || undefined,
    includeVoided: state.voided === 'include' ? 'true' : undefined,
    page: state.page,
    limit: PAGE_SIZE,
  };
  const query = useQuery({ ...entriesQuery(churchId, params), placeholderData: keepPreviousData });
  const [voiding, setVoiding] = useState<string | null>(null);
  const voidEntry = useMutationToast(useVoidEntry(churchId), { success: t('finance.entryVoided') });
  const [exporting, setExporting] = useState(false);
  const account = setup.accounts.find((item) => item.id === state.accountId);
  const filtered = !!(
    state.q ||
    state.fundId ||
    state.sourceType ||
    state.direction ||
    state.from ||
    state.accountId
  );

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { page: _page, limit: _limit, ...rest } = params;
      await downloadCsv(csvUrl(churchId, '/entries'), rest, `jurnal-${state.from || 'semua'}.csv`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('finance.searchLedger'),
        }}
        actions={
          <>
            <DateRangePicker
              value={{ from: state.from, to: state.to }}
              onChange={(range) => setState({ from: range.from, to: range.to })}
              className={compactRange(!!state.from)}
            />
            <Button
              variant="outline"
              size="icon-lg"
              aria-label={t('finance.exportCsv')}
              loading={exporting}
              onClick={() => void exportCsv()}
            >
              {!exporting ? <Download /> : null}
            </Button>
          </>
        }
        filters={[
          {
            id: 'account',
            label: t('finance.account'),
            value: state.accountId,
            onChange: (accountId) => setState({ accountId }),
            options: setup.accounts.map((item) => ({ value: item.id, label: item.name })),
          },
          {
            id: 'fund',
            label: t('finance.fund'),
            value: state.fundId,
            onChange: (fundId) => setState({ fundId }),
            options: setup.funds.map((item) => ({ value: item.id, label: item.name })),
          },
          {
            id: 'source',
            label: t('finance.source'),
            value: state.sourceType,
            onChange: (sourceType) => setState({ sourceType }),
            options: FINANCE_ENTRY_SOURCES.map((value) => ({
              value,
              label: localize(FINANCE_ENTRY_SOURCE_LABELS[value], locale),
            })),
          },
          {
            id: 'direction',
            label: t('finance.direction'),
            value: state.direction,
            onChange: (direction) => setState({ direction }),
            options: [
              { value: 'in', label: t('finance.moneyIn') },
              { value: 'out', label: t('finance.moneyOut') },
            ],
          },
          {
            id: 'voided',
            label: t('finance.voidedFilter'),
            value: state.voided,
            onChange: (voided) => setState({ voided }),
            options: [{ value: 'include', label: t('finance.includeVoided') }],
          },
        ]}
        onReset={() => reset()}
      />
      {account ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-muted/50 px-4 py-3 text-sm">
          <span className="font-medium">{account.name}</span>
          <span className="flex items-baseline gap-2">
            <span className="text-muted-foreground">{t('finance.currentBalance')}</span>
            <Money value={account.balance} className="text-base" />
          </span>
        </div>
      ) : null}
      {query.isPending ? (
        <SkeletonTable rows={8} columns={5} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          tone="emerald"
          title={filtered ? t('common.noResults') : t('finance.noEntriesTitle')}
          description={filtered ? t('common.noResultsHint') : t('finance.noEntriesDescription')}
        />
      ) : (
        <>
          <ResponsiveTable
            items={query.data.items}
            getKey={(entry) => entry.id}
            caption={t('finance.entries')}
            href={(entry) => {
              const target = sourcePath(entry.sourceType, entry.sourceId);
              return target ? `${base}/${target}` : undefined;
            }}
            actions={(entry) => [
              {
                id: 'void',
                label: t('finance.void'),
                icon: Undo2,
                destructive: true,
                hidden:
                  entry.sourceType !== 'adjustment' ||
                  !!entry.voidedAt ||
                  !has(access, 'finance.manage'),
                onSelect: () => setVoiding(entry.id),
              },
            ]}
            columns={[
              {
                id: 'description',
                header: t('finance.descriptionField'),
                primary: true,
                cell: (entry) => (
                  <span className="flex items-center gap-2.5">
                    <ToneIcon
                      icon={SOURCE_ICON[entry.sourceType]}
                      tone={SOURCE_TONE[entry.sourceType]}
                      size="sm"
                      className="hidden md:flex"
                    />
                    <span
                      className={
                        entry.voidedAt
                          ? 'min-w-0 truncate text-muted-foreground line-through'
                          : 'min-w-0 truncate'
                      }
                    >
                      {entry.description}
                    </span>
                  </span>
                ),
              },
              {
                id: 'date',
                header: t('finance.date'),
                secondary: true,
                cell: (entry) => (
                  <span className="inline-flex items-center gap-2">
                    {formatDate(entry.entryDate, 'dateShort')}
                    {entry.voidedAt ? (
                      <StatusBadge tone="danger" size="sm">
                        {t('finance.voided')}
                      </StatusBadge>
                    ) : null}
                  </span>
                ),
              },
              { id: 'account', header: t('finance.account'), cell: (entry) => entry.accountName },
              {
                id: 'fund',
                header: t('finance.fund'),
                hideBelowLg: true,
                hideOnMobile: true,
                cell: (entry) => entry.fundName,
              },
              {
                id: 'category',
                header: t('finance.category'),
                hideBelowLg: true,
                hideOnMobile: true,
                cell: (entry) => entry.categoryName ?? '—',
              },
              {
                id: 'amount',
                header: t('finance.amount'),
                align: 'right',
                cell: (entry) => <Money value={entry.amount} signed />,
              },
              ...(account
                ? [
                    {
                      id: 'balance',
                      header: t('finance.runningBalance'),
                      align: 'right' as const,
                      cell: (entry: (typeof query.data.items)[number]) => (
                        <Money value={entry.runningBalance} />
                      ),
                    },
                  ]
                : []),
            ]}
          />
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => setState({ page })}
          />
        </>
      )}
      <ReasonDialog
        open={!!voiding}
        onOpenChange={(open) => !open && setVoiding(null)}
        title={t('finance.voidEntryTitle')}
        description={t('finance.voidEntryDescription')}
        confirmLabel={t('finance.void')}
        loading={voidEntry.isPending}
        onConfirm={async (reason) => {
          if (voiding && (await voidEntry.run({ id: voiding, reason }))) setVoiding(null);
        }}
      />
    </>
  );
}

function TransfersTab() {
  const { t, formatDate } = useI18n();
  const { churchId, access } = useChurch();
  const [state, setState] = useUrlState({ page: 1 });
  const query = useQuery({
    ...transfersQuery(churchId, { page: state.page }),
    placeholderData: keepPreviousData,
  });
  const [voiding, setVoiding] = useState<string | null>(null);
  const voidTransfer = useMutationToast(useVoidTransfer(churchId), {
    success: t('finance.transferVoided'),
  });
  if (query.isPending) return <SkeletonTable rows={4} columns={4} />;
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        message={getErrorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        tone="sky"
        title={t('finance.noTransfersTitle')}
        description={t('finance.noTransfersDescription')}
      />
    );
  }
  return (
    <>
      <ResponsiveTable
        items={query.data.items}
        getKey={(transfer) => transfer.id}
        caption={t('finance.transfers')}
        actions={(transfer) => [
          {
            id: 'void',
            label: t('finance.void'),
            icon: Undo2,
            destructive: true,
            hidden: !!transfer.voidedAt || !has(access, 'finance.manage'),
            onSelect: () => setVoiding(transfer.id),
          },
        ]}
        columns={[
          {
            id: 'route',
            header: t('finance.transferRoute'),
            primary: true,
            cell: (transfer) => (
              <span
                className={transfer.voidedAt ? 'text-muted-foreground line-through' : undefined}
              >
                {transfer.fromAccountName} → {transfer.toAccountName}
              </span>
            ),
          },
          {
            id: 'date',
            header: t('finance.date'),
            secondary: true,
            cell: (transfer) =>
              `${formatDate(transfer.transferDate, 'dateShort')}${transfer.note ? ` · ${transfer.note}` : ''}`,
          },
          { id: 'fund', header: t('finance.fund'), cell: (transfer) => transfer.fundName },
          {
            id: 'status',
            header: t('finance.status'),
            cell: (transfer) =>
              transfer.voidedAt ? (
                <StatusBadge tone="danger" dot>
                  {t('finance.voided')}
                </StatusBadge>
              ) : (
                <StatusBadge tone="success" dot>
                  {t('finance.posted')}
                </StatusBadge>
              ),
          },
          {
            id: 'amount',
            header: t('finance.amount'),
            align: 'right',
            cell: (transfer) => <Money value={transfer.amount} />,
          },
        ]}
      />
      <Pagination
        page={query.data.page}
        pageSize={query.data.limit}
        total={query.data.total}
        onPageChange={(page) => setState({ page })}
      />
      <ReasonDialog
        open={!!voiding}
        onOpenChange={(open) => !open && setVoiding(null)}
        title={t('finance.voidTransferTitle')}
        description={t('finance.voidTransferDescription')}
        confirmLabel={t('finance.void')}
        loading={voidTransfer.isPending}
        onConfirm={async (reason) => {
          if (voiding && (await voidTransfer.run({ id: voiding, reason }))) setVoiding(null);
        }}
      />
    </>
  );
}

type AdjustmentForm = z.input<typeof financeAdjustmentInputSchema>;

function AdjustmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { churchId, church } = useChurch();
  const setup = useFinanceSetup();
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const form = useForm<AdjustmentForm, unknown, FinanceAdjustmentInput>({
    resolver: zodResolver(financeAdjustmentInputSchema),
    values: {
      entryDate: todayIn(church.timezone),
      accountId: setup.activeAccounts[0]?.id ?? '',
      fundId: setup.activeFunds[0]?.id ?? '',
      categoryId: null,
      amount: 0,
      description: '',
    },
  });
  const save = useMutationToast(useSaveAdjustment(churchId), {
    success: t('finance.adjustmentPosted'),
    form,
  });
  const errors = form.formState.errors;
  const categories = direction === 'in' ? setup.incomeCategories : setup.expenseCategories;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('finance.newAdjustment')}</DialogTitle>
          <DialogDescription>{t('finance.adjustmentDescription')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex min-h-0 flex-col gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            const amount = Math.abs(values.amount) * (direction === 'out' ? -1 : 1);
            if (await save.run({ ...values, amount })) onOpenChange(false);
          })}
        >
          <DialogBody className="flex flex-col gap-4">
            <Segmented
              aria-label={t('finance.direction')}
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'in', label: t('finance.moneyIn') },
                { value: 'out', label: t('finance.moneyOut') },
              ]}
            />
            <Field
              label={t('finance.descriptionField')}
              htmlFor="adjust-description"
              error={errors.description?.message}
              required
            >
              <Input id="adjust-description" autoFocus {...form.register('description')} />
            </Field>
            <Controller
              control={form.control}
              name="amount"
              render={({ field }) => (
                <Field
                  label={t('finance.amount')}
                  htmlFor="adjust-amount"
                  error={errors.amount?.message}
                  required
                >
                  <CurrencyInput
                    id="adjust-amount"
                    value={field.value ? Math.abs(field.value) : null}
                    onChange={(value) => field.onChange(value ?? 0)}
                  />
                </Field>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('finance.account')} htmlFor="adjust-account">
                <Select id="adjust-account" {...form.register('accountId')}>
                  {setup.activeAccounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('finance.fund')} htmlFor="adjust-fund">
                <Select id="adjust-fund" {...form.register('fundId')}>
                  {setup.activeFunds.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Field label={t('finance.category')} htmlFor="adjust-category">
                    <Select
                      id="adjust-category"
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value || null)}
                    >
                      <option value="">{t('finance.noCategory')}</option>
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              />
              <Field
                label={t('finance.date')}
                htmlFor="adjust-date"
                error={errors.entryDate?.message}
              >
                <Input id="adjust-date" type="date" {...form.register('entryDate')} />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('finance.post')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type TransferForm = z.input<typeof financeTransferInputSchema>;

function TransferDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, formatCurrency } = useI18n();
  const { churchId, church } = useChurch();
  const setup = useFinanceSetup();
  const cash = setup.activeAccounts.find((item) => item.type === 'cash');
  const bank = setup.activeAccounts.find((item) => item.type === 'bank');
  const form = useForm<TransferForm, unknown, FinanceTransferInput>({
    resolver: zodResolver(financeTransferInputSchema),
    values: {
      fromAccountId: cash?.id ?? setup.activeAccounts[0]?.id ?? '',
      toAccountId: bank?.id ?? setup.activeAccounts[1]?.id ?? '',
      fundId: setup.activeFunds[0]?.id ?? '',
      amount: 0,
      transferDate: todayIn(church.timezone),
      note: '',
    },
  });
  const save = useMutationToast(useSaveTransfer(churchId), {
    success: t('finance.transferPosted'),
    form,
  });
  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('finance.newTransfer')}</DialogTitle>
          <DialogDescription>{t('finance.transferDescription')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex min-h-0 flex-col gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            if (await save.run(values)) onOpenChange(false);
          })}
        >
          <DialogBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('finance.fromAccount')} htmlFor="transfer-from">
                <Select id="transfer-from" autoFocus {...form.register('fromAccountId')}>
                  {setup.activeAccounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.balance !== null ? ` · ${formatCurrency(item.balance)}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t('finance.toAccount')}
                htmlFor="transfer-to"
                error={errors.toAccountId?.message}
              >
                <Select
                  id="transfer-to"
                  aria-invalid={!!errors.toAccountId}
                  {...form.register('toAccountId')}
                >
                  {setup.activeAccounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Controller
              control={form.control}
              name="amount"
              render={({ field }) => (
                <Field
                  label={t('finance.amount')}
                  htmlFor="transfer-amount"
                  error={errors.amount?.message}
                  required
                >
                  <CurrencyInput
                    id="transfer-amount"
                    value={field.value || null}
                    onChange={(value) => field.onChange(value ?? 0)}
                  />
                </Field>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('finance.fund')} htmlFor="transfer-fund">
                <Select id="transfer-fund" {...form.register('fundId')}>
                  {setup.activeFunds.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t('finance.date')}
                htmlFor="transfer-date"
                error={errors.transferDate?.message}
              >
                <Input id="transfer-date" type="date" {...form.register('transferDate')} />
              </Field>
            </div>
            <Field label={t('finance.notes')} htmlFor="transfer-note">
              <Input
                id="transfer-note"
                placeholder={t('finance.transferNotePlaceholder')}
                {...form.register('note')}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('finance.post')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
