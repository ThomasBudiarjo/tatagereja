import {
  DIAKONIA_CATEGORIES,
  DIAKONIA_CATEGORY_LABELS,
  DIAKONIA_FORMS,
  DIAKONIA_FORM_LABELS,
  canManageDiakonia,
  diakoniaAidInputSchema,
  localize,
  type DiakoniaAid,
  type DiakoniaAidInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ban, HandCoins, HandHeart, Pencil, Plus, Receipt, Users } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FilterBar } from '@/components/ui/filter-bar';
import { Input, Textarea } from '@/components/ui/input';
import { Alert, Segmented } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { PrintButton, PrintHeader } from '@/components/ui/print';
import { ResponsiveTable } from '@/components/ui/responsive-table';
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
import { SkeletonStats, SkeletonTable } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { aidListQuery, aidQuery, useSaveAid, useVoidAid, type AidListParams } from './api';
import { CareNav, HouseholdCombobox, PersonCombobox, SubjectLine } from './components';
import { useToday } from './helpers';

const PAGE_SIZE = 25;

const recipientOf = (aid: DiakoniaAid) => (
  <SubjectLine person={aid.person} household={aid.household} fallback={aid.recipientName ?? '—'} />
);

export function DiakoniaPage() {
  const { t, locale, formatDate, formatCurrency, formatNumber } = useI18n();
  const { church, churchId, base, access } = useChurch();
  const today = useToday();
  const canManage = canManageDiakonia(access);
  const [state, setState, reset] = useUrlState({
    q: '',
    category: '',
    form: '',
    period: 'year',
    voided: false as boolean,
    page: 1,
    aid: '',
    new: false as boolean,
    caseId: '',
  });
  const from =
    state.period === 'month'
      ? `${today.slice(0, 7)}-01`
      : state.period === 'year'
        ? `${today.slice(0, 4)}-01-01`
        : undefined;
  const params: AidListParams = {
    q: state.q || undefined,
    category: state.category || undefined,
    form: state.form || undefined,
    from,
    includeVoided: state.voided ? 'true' : undefined,
    page: state.page,
    limit: PAGE_SIZE,
  };
  const query = useQuery({ ...aidListQuery(churchId, params), placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<DiakoniaAid | null>(null);
  const location = useLocation();
  /** Opens a record in the detail sheet, keeping the filters in the URL. */
  const detailHref = (id: string) => {
    const search = new URLSearchParams(location.search);
    search.set('aid', id);
    return `${location.pathname}?${search.toString()}`;
  };
  const filtered = !!(
    state.q ||
    state.category ||
    state.form ||
    state.voided ||
    state.period !== 'year'
  );
  const recordButton = canManage ? (
    <Button className="max-sm:size-11 max-sm:px-0" onClick={() => setState({ new: true })}>
      <Plus />
      <span className="hidden sm:inline">{t('care.recordAid')}</span>
      <span className="sr-only sm:hidden">{t('care.recordAid')}</span>
    </Button>
  ) : null;

  return (
    <Page size="wide">
      <PageHeader
        icon={HandCoins}
        tone="emerald"
        title={t('care.diakoniaTitle')}
        description={t('care.diakoniaDescription')}
        breadcrumbs={[
          { label: t('care.nav'), to: `${base}/care` },
          { label: t('care.navDiakonia') },
        ]}
        actions={
          <>
            {query.data && query.data.items.length > 0 ? (
              <PrintButton className="max-sm:hidden" />
            ) : null}
            {recordButton}
          </>
        }
      />
      <PrintHeader
        churchName={church.name}
        logoUrl={church.logoUrl}
        title={t('care.diakoniaTitle')}
        subtitle={
          state.period === 'month'
            ? t('common.rangeThisMonth')
            : state.period === 'year'
              ? t('common.rangeThisYear')
              : t('care.allTime')
        }
      />
      <CareNav />
      {query.isPending ? (
        <SkeletonStats count={3} />
      ) : query.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            className="col-span-2 lg:col-span-1"
            label={t('care.totalGiven')}
            value={formatCurrency(query.data.summary.amount)}
            icon={HandCoins}
            tone="emerald"
            hint={t('care.totalGivenHint')}
          />
          <StatCard
            label={t('care.aidRecords')}
            value={formatNumber(query.data.summary.count)}
            icon={Receipt}
            tone="teal"
          />
          <StatCard
            label={t('care.aidRecipients')}
            value={formatNumber(query.data.summary.recipients)}
            icon={Users}
            tone="sky"
          />
        </div>
      ) : null}
      <div data-print="hide">
        <FilterBar
          search={{
            value: state.q,
            onChange: (q) => setState({ q }),
            placeholder: t('care.searchAid'),
          }}
          filters={[
            {
              id: 'period',
              label: t('care.period'),
              value: state.period,
              onChange: (period) => setState({ period }),
              options: [
                { value: 'month', label: t('common.rangeThisMonth') },
                { value: 'year', label: t('common.rangeThisYear') },
                { value: 'all', label: t('care.allTime') },
              ],
            },
            {
              id: 'category',
              label: t('care.aidCategory'),
              value: state.category,
              onChange: (category) => setState({ category }),
              options: DIAKONIA_CATEGORIES.map((value) => ({
                value,
                label: localize(DIAKONIA_CATEGORY_LABELS[value], locale),
              })),
            },
            {
              id: 'form',
              label: t('care.aidForm'),
              value: state.form,
              onChange: (form) => setState({ form }),
              options: DIAKONIA_FORMS.map((value) => ({
                value,
                label: localize(DIAKONIA_FORM_LABELS[value], locale),
              })),
            },
            {
              id: 'voided',
              label: t('care.voidedFilter'),
              value: state.voided ? 'yes' : '',
              onChange: (value) => setState({ voided: value === 'yes' }),
              options: [{ value: 'yes', label: t('care.includeVoided') }],
            },
          ]}
          onReset={() => reset(['period'])}
        />
      </div>
      {query.isPending ? (
        <SkeletonTable rows={6} columns={5} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          tone="emerald"
          title={filtered ? t('common.noResults') : t('care.noAidTitle')}
          description={filtered ? t('common.noResultsHint') : t('care.noAidDescription')}
          action={!filtered ? recordButton : null}
        />
      ) : (
        <>
          <ResponsiveTable
            items={query.data.items}
            getKey={(aid) => aid.id}
            caption={t('care.diakoniaTitle')}
            href={(aid) => detailHref(aid.id)}
            columns={[
              {
                id: 'recipient',
                header: t('care.recipient'),
                primary: true,
                cell: (aid) => (
                  <span className={aid.voidedAt ? 'line-through opacity-60' : undefined}>
                    {recipientOf(aid)}
                  </span>
                ),
              },
              {
                id: 'date',
                header: t('care.givenAt'),
                secondary: true,
                cell: (aid) => formatDate(aid.givenAt, 'dateShort'),
              },
              {
                id: 'category',
                header: t('care.aidCategory'),
                cell: (aid) => (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone="emerald" size="sm">
                      {localize(DIAKONIA_CATEGORY_LABELS[aid.category], locale)}
                    </StatusBadge>
                    {aid.voidedAt ? (
                      <StatusBadge tone="danger" size="sm" icon={Ban}>
                        {t('care.voided')}
                      </StatusBadge>
                    ) : null}
                  </span>
                ),
              },
              {
                id: 'form',
                header: t('care.aidForm'),
                hideOnMobile: true,
                cell: (aid) => localize(DIAKONIA_FORM_LABELS[aid.form], locale),
              },
              {
                id: 'reference',
                header: t('care.financeReference'),
                hideBelowLg: true,
                hideOnMobile: true,
                cell: (aid) => aid.financeReference ?? '—',
              },
              {
                id: 'amount',
                header: t('care.amount'),
                align: 'right',
                cell: (aid) =>
                  aid.amount !== null ? (
                    <span className="font-semibold whitespace-nowrap tabular">
                      {formatCurrency(aid.amount)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
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
      <AidDetailSheet
        aidId={state.aid || null}
        onOpenChange={(open) => !open && setState({ aid: '' })}
        onEdit={(aid) => {
          setState({ aid: '' });
          setEditing(aid);
        }}
      />
      <AidSheet
        open={canManage && state.new}
        caseId={state.caseId || null}
        onOpenChange={(open) => setState({ new: open, caseId: open ? state.caseId : '' })}
      />
      <AidSheet
        open={!!editing}
        aid={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </Page>
  );
}

function AidDetailSheet({
  aidId,
  onOpenChange,
  onEdit,
}: {
  aidId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (aid: DiakoniaAid) => void;
}) {
  const { t, locale, formatDate, formatCurrency } = useI18n();
  const { churchId, base, access } = useChurch();
  const query = useQuery({ ...aidQuery(churchId, aidId ?? ''), enabled: !!aidId });
  const [voiding, setVoiding] = useState(false);
  const aid = query.data?.aid;
  const canManage = canManageDiakonia(access);
  return (
    <Sheet open={!!aidId} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('care.aidDetail')}</SheetTitle>
          <SheetDescription>{aid ? formatDate(aid.givenAt, 'dateLong') : null}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {query.isPending ? (
            <SkeletonStats count={2} />
          ) : query.isError ? (
            <ErrorState
              compact
              error={query.error}
              message={getErrorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : aid ? (
            <>
              {aid.voidedAt ? (
                <Alert
                  variant="error"
                  title={t('care.voidedOn', { date: formatDate(aid.voidedAt, 'dateShort') })}
                >
                  {aid.voidReason}
                </Alert>
              ) : null}
              <div data-tone="emerald" className="rounded-2xl bg-tone-soft/60 p-4">
                <p className="text-overline text-tone-ink">{t('care.amount')}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight tabular">
                  {aid.amount !== null ? formatCurrency(aid.amount) : t('care.noAmount')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {localize(DIAKONIA_CATEGORY_LABELS[aid.category], locale)} ·{' '}
                  {localize(DIAKONIA_FORM_LABELS[aid.form], locale)}
                </p>
              </div>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-overline text-muted-foreground">{t('care.recipient')}</dt>
                  <dd className="mt-1 font-medium">{recipientOf(aid)}</dd>
                </div>
                {aid.description ? (
                  <div>
                    <dt className="text-overline text-muted-foreground">
                      {t('care.aidDescription')}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap">{aid.description}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-overline text-muted-foreground">
                    {t('care.financeReference')}
                  </dt>
                  <dd className="mt-1 font-mono text-[13px]">{aid.financeReference ?? '—'}</dd>
                </div>
                {aid.createdBy ? (
                  <div>
                    <dt className="text-overline text-muted-foreground">
                      {t('care.recordedByLabel')}
                    </dt>
                    <dd className="mt-1">{aid.createdBy.name}</dd>
                  </div>
                ) : null}
              </dl>
              {aid.caseId ? (
                <Button asChild variant="soft" className="w-fit">
                  <Link to={`${base}/care/cases/${aid.caseId}`}>
                    <HandHeart />
                    {t('care.openLinkedCase')}
                  </Link>
                </Button>
              ) : null}
            </>
          ) : null}
        </SheetBody>
        {aid && canManage && !aid.voidedAt ? (
          <SheetFooter>
            <Button variant="outline" onClick={() => setVoiding(true)}>
              <Ban />
              {t('care.voidAid')}
            </Button>
            <Button onClick={() => onEdit(aid)}>
              <Pencil />
              {t('common.edit')}
            </Button>
          </SheetFooter>
        ) : null}
        {aid ? <VoidDialog aid={aid} open={voiding} onOpenChange={setVoiding} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function VoidDialog({
  aid,
  open,
  onOpenChange,
}: {
  aid: DiakoniaAid;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const [reason, setReason] = useState('');
  const run = useMutationToast(useVoidAid(churchId), { success: t('care.aidVoided') });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setReason('');
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('care.voidAidTitle')}</DialogTitle>
          <DialogDescription>{t('care.voidAidDescription')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run.run({ id: aid.id, reason: reason.trim() })) onOpenChange(false);
          }}
        >
          <Field label={t('care.voidReason')} htmlFor="void-reason" required>
            <Input
              id="void-reason"
              autoFocus
              value={reason}
              placeholder={t('care.voidReasonPlaceholder')}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={reason.trim().length < 3}
              loading={run.isPending}
            >
              {t('care.voidAid')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FormValues = z.input<typeof diakoniaAidInputSchema>;

function AidSheet({
  open,
  onOpenChange,
  aid,
  caseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aid?: DiakoniaAid | null;
  caseId?: string | null;
}) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{aid ? t('care.editAid') : t('care.recordAid')}</SheetTitle>
          <SheetDescription>{t('care.aidSheetDescription')}</SheetDescription>
        </SheetHeader>
        {open ? (
          <AidForm
            key={aid?.id ?? 'new'}
            aid={aid ?? undefined}
            caseId={caseId ?? null}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AidForm({
  aid,
  caseId,
  onDone,
}: {
  aid?: DiakoniaAid;
  caseId: string | null;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const { churchId } = useChurch();
  const today = useToday();
  const [recipientMode, setRecipientMode] = useState<'person' | 'other'>(
    aid && !aid.person ? 'other' : 'person',
  );
  const form = useForm<FormValues, unknown, DiakoniaAidInput>({
    resolver: zodResolver(diakoniaAidInputSchema),
    defaultValues: {
      personId: aid?.person?.id ?? null,
      householdId: aid?.household?.id ?? null,
      caseId: aid ? aid.caseId : caseId,
      recipientName: aid?.recipientName ?? '',
      category: aid?.category ?? 'food',
      form: aid?.form ?? 'cash',
      description: aid?.description ?? '',
      amount: aid?.amount ?? null,
      givenAt: aid?.givenAt ?? today,
      financeReference: aid?.financeReference ?? '',
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useSaveAid(churchId), {
    success: aid ? t('care.aidSaved') : t('care.aidRecorded'),
    form,
  });
  const onSubmit = form.handleSubmit(async (values) => {
    const body =
      recipientMode === 'person'
        ? { ...values, recipientName: null }
        : { ...values, personId: null };
    if (await save.run({ ...body, id: aid?.id })) onDone();
  });
  const recipientError = errors.personId?.message;
  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <SheetBody className="flex flex-col gap-4">
        {form.getValues('caseId') ? <Alert variant="info">{t('care.aidForCaseHint')}</Alert> : null}
        <Segmented
          aria-label={t('care.recipient')}
          value={recipientMode}
          onChange={setRecipientMode}
          options={[
            { value: 'person', label: t('care.recipientMember') },
            { value: 'other', label: t('care.recipientOther') },
          ]}
        />
        {recipientMode === 'person' ? (
          <Controller
            control={form.control}
            name="personId"
            render={({ field }) => (
              <Field
                label={t('care.recipient')}
                htmlFor="aid-person"
                error={recipientError}
                required
              >
                <PersonCombobox
                  id="aid-person"
                  value={field.value ?? null}
                  selected={aid?.person}
                  invalid={!!recipientError}
                  onChange={(value) => field.onChange(value)}
                />
              </Field>
            )}
          />
        ) : (
          <Field
            label={t('care.recipientName')}
            htmlFor="aid-recipient-name"
            error={recipientError ?? errors.recipientName?.message}
            required
          >
            <Input id="aid-recipient-name" autoFocus {...form.register('recipientName')} />
          </Field>
        )}
        <Controller
          control={form.control}
          name="householdId"
          render={({ field }) => (
            <Field label={t('care.household')} htmlFor="aid-household">
              <HouseholdCombobox
                id="aid-household"
                value={field.value ?? null}
                selected={aid?.household}
                onChange={field.onChange}
              />
            </Field>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('care.aidCategory')} htmlFor="aid-category">
            <Select id="aid-category" {...form.register('category')}>
              {DIAKONIA_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {localize(DIAKONIA_CATEGORY_LABELS[value], locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t('care.givenAt')}
            htmlFor="aid-given"
            error={errors.givenAt?.message}
            required
          >
            <Input id="aid-given" type="date" max={today} {...form.register('givenAt')} />
          </Field>
        </div>
        <Controller
          control={form.control}
          name="form"
          render={({ field }) => (
            <Field label={t('care.aidForm')}>
              <Segmented
                aria-label={t('care.aidForm')}
                value={field.value ?? 'cash'}
                onChange={field.onChange}
                options={DIAKONIA_FORMS.map((value) => ({
                  value,
                  label: localize(DIAKONIA_FORM_LABELS[value], locale),
                }))}
              />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="amount"
          render={({ field }) => (
            <Field
              label={t('care.amount')}
              htmlFor="aid-amount"
              error={errors.amount?.message}
              description={t('care.amountHint')}
            >
              <CurrencyInput
                id="aid-amount"
                value={field.value ?? null}
                onChange={field.onChange}
                aria-invalid={!!errors.amount}
              />
            </Field>
          )}
        />
        <Field label={t('care.aidDescription')} htmlFor="aid-description">
          <Textarea
            id="aid-description"
            rows={3}
            placeholder={t('care.aidDescriptionPlaceholder')}
            {...form.register('description')}
          />
        </Field>
        <Field
          label={t('care.financeReference')}
          htmlFor="aid-reference"
          description={t('care.financeReferenceHint')}
        >
          <Input
            id="aid-reference"
            placeholder="KK-2026-0142"
            {...form.register('financeReference')}
          />
        </Field>
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {aid ? t('common.saveChanges') : t('care.recordAid')}
        </Button>
      </SheetFooter>
    </form>
  );
}
