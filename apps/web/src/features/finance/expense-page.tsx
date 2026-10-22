import {
  canCancelExpense,
  canEditExpense,
  canPayExpense,
  fullName,
  has,
  payExpenseBodySchema,
  type ExpenseRequest,
  type PayExpenseBody,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  Ban,
  Banknote,
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  Pencil,
  Receipt,
  Send,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { SkeletonCards, SkeletonText } from '@/components/ui/skeleton';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { Stepper } from '@/components/ui/stepper';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { expenseQuery, useExpenseAction } from './api';
import { ExpenseStatusBadge, Money, ReasonDialog } from './components';
import { todayIn, useFinanceSetup } from './helpers';

export function ExpensePage() {
  const { t } = useI18n();
  const { churchId, base } = useChurch();
  const { expenseId = '' } = useParams();
  const query = useQuery(expenseQuery(churchId, expenseId));
  const crumbs = [
    { label: t('finance.nav'), to: `${base}/finance` },
    { label: t('finance.navExpenses'), to: `${base}/finance/expenses` },
  ];
  if (query.isPending) {
    return (
      <Page>
        <PageHeader title={t('finance.expenseDetail')} breadcrumbs={crumbs} />
        <SkeletonText lines={2} />
        <SkeletonCards count={2} className="sm:grid-cols-1 lg:grid-cols-2" />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('finance.expenseDetail')} breadcrumbs={crumbs} />
        {isApiClientError(query.error) && query.error.status === 404 ? (
          <NoAccessState
            title={t('common.notFoundTitle')}
            description={t('finance.expenseMissing')}
          />
        ) : (
          <ErrorState
            error={query.error}
            message={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        )}
      </Page>
    );
  }
  return <ExpenseDetail expense={query.data.expense} crumbs={crumbs} />;
}

const stepOf = (expense: ExpenseRequest) =>
  ({ draft: 0, submitted: 1, approved: 2, rejected: 2, paid: 3, cancelled: 0 })[expense.status];

function ExpenseDetail({
  expense,
  crumbs,
}: {
  expense: ExpenseRequest;
  crumbs: { label: string; to?: string }[];
}) {
  const { t, formatDate, formatDateTime, formatCurrency } = useI18n();
  const { churchId, base, access } = useChurch();
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'pay' | 'cancel' | null>(null);
  const action = useExpenseAction(churchId, expense.id);
  const run = useMutationToast(action, {
    success: (_data, variables) =>
      variables.action === 'decide'
        ? variables.body.decision === 'approved'
          ? t('finance.expenseApproved')
          : t('finance.expenseRejected')
        : {
            submit: t('finance.expenseSubmitted'),
            pay: t('finance.expensePaid'),
            cancel: t('finance.expenseCancelled'),
          }[variables.action],
  });
  const close = () => setDialog(null);
  const canEdit = canEditExpense(access, expense);
  const canPay = canPayExpense(access, expense);
  const canCancel = canCancelExpense(access, expense);
  const ownRequest = expense.requestedBy === access.userId;

  return (
    <Page>
      <PageHeader
        icon={Receipt}
        tone="rose"
        eyebrow={expense.isReimbursement ? t('finance.reimbursement') : t('finance.expenseRequest')}
        title={expense.title}
        breadcrumbs={[...crumbs, { label: expense.title }]}
      />

      {expense.status !== 'cancelled' && expense.status !== 'rejected' ? (
        <Stepper
          current={stepOf(expense)}
          steps={[
            { id: 'draft', label: t('finance.stepDraft') },
            { id: 'submitted', label: t('finance.stepSubmitted') },
            { id: 'approved', label: t('finance.stepApproved') },
            { id: 'paid', label: t('finance.stepPaid') },
          ]}
        />
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <ExpenseStatusBadge status={expense.status} />
            <p className="text-3xl font-bold tracking-tight tabular">
              {formatCurrency(expense.amount)}
            </p>
            <p className="text-sm text-muted-foreground">
              {expense.categoryName} · {expense.fundName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <>
                <Button asChild variant="outline">
                  <Link to={`${base}/finance/expenses/${expense.id}/edit`}>
                    <Pencil />
                    {t('common.edit')}
                  </Link>
                </Button>
                <Button loading={run.isPending} onClick={() => void run.run({ action: 'submit' })}>
                  <Send />
                  {t('finance.submitForApproval')}
                </Button>
              </>
            ) : null}
            {expense.canApprove ? (
              <>
                <Button onClick={() => setDialog('approve')}>
                  <ThumbsUp />
                  {t('finance.approve')}
                </Button>
                <Button variant="outline" onClick={() => setDialog('reject')}>
                  <ThumbsDown />
                  {t('finance.reject')}
                </Button>
              </>
            ) : null}
            {canPay ? (
              <Button onClick={() => setDialog('pay')}>
                <Banknote />
                {t('finance.markPaid')}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setDialog('cancel')}
              >
                <Ban />
                {t('finance.cancelRequest')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {expense.status === 'submitted' && ownRequest && has(access, 'finance.approve') ? (
        <Alert variant="info" title={t('finance.selfApprovalTitle')}>
          {t('finance.selfApprovalHint')}
        </Alert>
      ) : null}
      {expense.decisionNote && (expense.status === 'rejected' || expense.status === 'cancelled') ? (
        <Alert
          variant={expense.status === 'rejected' ? 'error' : 'warning'}
          title={t('finance.decisionNote')}
        >
          {expense.decisionNote}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <Section title={t('finance.details')} className="lg:col-span-3">
          <Card>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Detail label={t('finance.requester')} value={expense.requesterName} />
                <Detail label={t('finance.payee')} value={expense.payeeName} />
                {expense.reimbursePerson ? (
                  <Detail
                    label={t('finance.reimbursePerson')}
                    value={fullName(expense.reimbursePerson)}
                  />
                ) : null}
                <Detail
                  label={t('finance.neededBy')}
                  value={expense.neededBy ? formatDate(expense.neededBy, 'dateShort') : null}
                />
                {expense.paidFromAccountName ? (
                  <Detail label={t('finance.paidFrom')} value={expense.paidFromAccountName} />
                ) : null}
                {expense.paymentReference ? (
                  <Detail label={t('finance.reference')} value={expense.paymentReference} />
                ) : null}
              </dl>
              {expense.description ? (
                <p className="mt-4 border-t border-border/60 pt-3 text-sm whitespace-pre-line">
                  {expense.description}
                </p>
              ) : null}
            </CardContent>
          </Card>
          {expense.attachmentUrls.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {expense.attachmentUrls.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex min-h-11 items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 truncate">{url}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
        <Section title={t('finance.history')} className="lg:col-span-2">
          <Timeline>
            <TimelineItem
              icon={FilePlus2}
              tone="neutral"
              title={t('finance.historyRequested', { name: expense.requesterName ?? '—' })}
              time={formatDateTime(expense.createdAt)}
            />
            {expense.submittedAt ? (
              <TimelineItem
                icon={Send}
                tone="warning"
                title={t('finance.historySubmitted')}
                time={formatDateTime(expense.submittedAt)}
              />
            ) : null}
            {expense.decidedAt ? (
              <TimelineItem
                icon={expense.status === 'rejected' ? XCircle : CheckCircle2}
                tone={expense.status === 'rejected' ? 'danger' : 'info'}
                title={
                  expense.status === 'rejected'
                    ? t('finance.historyRejected', { name: expense.decidedByName ?? '—' })
                    : t('finance.historyApproved', { name: expense.decidedByName ?? '—' })
                }
                time={formatDateTime(expense.decidedAt)}
              >
                {expense.status !== 'rejected' ? expense.decisionNote : null}
              </TimelineItem>
            ) : null}
            {expense.paidAt ? (
              <TimelineItem
                icon={Banknote}
                tone="success"
                title={t('finance.historyPaid', { name: expense.paidByName ?? '—' })}
                time={formatDate(expense.paidAt, 'dateShort')}
                last
              />
            ) : null}
          </Timeline>
        </Section>
      </div>

      <ConfirmDialog
        open={dialog === 'approve'}
        onOpenChange={(open) => !open && close()}
        variant="default"
        title={t('finance.approveTitle')}
        description={t('finance.approveDescription', { amount: formatCurrency(expense.amount) })}
        confirmLabel={t('finance.approve')}
        loading={run.isPending}
        onConfirm={async () => {
          if (await run.run({ action: 'decide', body: { decision: 'approved', note: null } }))
            close();
        }}
      />
      <ReasonDialog
        open={dialog === 'reject'}
        onOpenChange={(open) => !open && close()}
        title={t('finance.rejectTitle')}
        description={t('finance.rejectDescription')}
        confirmLabel={t('finance.reject')}
        loading={run.isPending}
        onConfirm={async (note) => {
          if (await run.run({ action: 'decide', body: { decision: 'rejected', note } })) close();
        }}
      />
      <ReasonDialog
        open={dialog === 'cancel'}
        onOpenChange={(open) => !open && close()}
        optional
        title={t('finance.cancelTitle')}
        description={t('finance.cancelDescription')}
        confirmLabel={t('finance.cancelRequest')}
        loading={run.isPending}
        onConfirm={async (reason) => {
          if (await run.run({ action: 'cancel', body: { reason: reason || null } })) close();
        }}
      />
      <PayDialog
        open={dialog === 'pay'}
        onOpenChange={(open) => !open && close()}
        expense={expense}
        pending={run.isPending}
        onPay={async (body) => !!(await run.run({ action: 'pay', body }))}
      />
    </Page>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value || '—'}</dd>
    </div>
  );
}

type PayForm = z.input<typeof payExpenseBodySchema>;

function PayDialog({
  open,
  onOpenChange,
  expense,
  pending,
  onPay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseRequest;
  pending: boolean;
  onPay: (body: PayExpenseBody) => Promise<boolean>;
}) {
  const { t, formatCurrency } = useI18n();
  const { church } = useChurch();
  const setup = useFinanceSetup();
  const form = useForm<PayForm, unknown, PayExpenseBody>({
    resolver: zodResolver(payExpenseBodySchema),
    values: {
      accountId:
        setup.activeAccounts.find((account) => account.type === 'bank')?.id ??
        setup.activeAccounts[0]?.id ??
        '',
      paidAt: todayIn(church.timezone),
      paymentReference: '',
    },
  });
  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('finance.payTitle')}</DialogTitle>
          <DialogDescription>
            {t('finance.payDescription', {
              amount: formatCurrency(expense.amount),
              title: expense.title,
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            if (await onPay(values)) onOpenChange(false);
          })}
        >
          <Field
            label={t('finance.paidFrom')}
            htmlFor="pay-account"
            error={errors.accountId?.message}
            required
          >
            <Select id="pay-account" autoFocus {...form.register('accountId')}>
              {setup.activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.balance !== null ? ` · ${formatCurrency(account.balance)}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('finance.paidAt')}
              htmlFor="pay-date"
              error={errors.paidAt?.message}
              required
            >
              <Input id="pay-date" type="date" {...form.register('paidAt')} />
            </Field>
            <Field label={t('finance.reference')} htmlFor="pay-reference">
              <Input id="pay-reference" {...form.register('paymentReference')} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              <Money value={expense.amount} className="text-inherit" />
              {t('finance.markPaid')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
