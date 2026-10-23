import {
  expenseRequestInputSchema,
  expenseRequestListSchema,
  expenseRequestResponseSchema,
  financeAccountInputSchema,
  financeAccountResponseSchema,
  financeAdjustmentInputSchema,
  financeBudgetListSchema,
  financeCampaignDetailSchema,
  financeCampaignInputSchema,
  financeCampaignListSchema,
  financeCampaignResponseSchema,
  financeCategoryInputSchema,
  financeCategoryResponseSchema,
  financeContributionInputSchema,
  financeContributionListSchema,
  financeContributionResponseSchema,
  financeDefaultsBodySchema,
  financeDonorListSchema,
  financeEntryListSchema,
  financeEntryResponseSchema,
  financeFundInputSchema,
  financeFundResponseSchema,
  financeMemberListSchema,
  financePendingSchema,
  financePeriodListSchema,
  financePeriodResponseSchema,
  financePledgeInputSchema,
  financePledgeResponseSchema,
  financeReportSchema,
  financeSetupSchema,
  financeSummarySchema,
  financeTransferInputSchema,
  financeTransferListSchema,
  financeTransferResponseSchema,
  givingStatementListSchema,
  givingStatementResponseSchema,
  myGivingSchema,
  offeringBatchInputSchema,
  offeringBatchListSchema,
  offeringBatchResponseSchema,
  offeringServiceListSchema,
  okSchema,
  saveBudgetBodySchema,
  type DecideExpenseBody,
  type ExpenseRequestListQuery,
  type FinanceContributionListQuery,
  type FinanceEntryListQuery,
  type FinanceReportKind,
  type OfferingBatchListQuery,
  type PayExpenseBody,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api, request } from '@/lib/api';
import { churchScope, keys } from '@/lib/keys';

/*
 * Finance queries and mutations. Every key lives under `['church', id, 'finance', ...]`, so a
 * write invalidates the whole module at once: balances, lists, details, counts and reports all
 * depend on the same ledger.
 */

export const financeKeys = {
  all: (churchId: string) => [...churchScope(churchId), 'finance'] as const,
  setup: (churchId: string) => [...financeKeys.all(churchId), 'setup'] as const,
  summary: (churchId: string) => [...financeKeys.all(churchId), 'summary'] as const,
  pending: (churchId: string) => [...financeKeys.all(churchId), 'pending'] as const,
  list: (churchId: string, kind: string, params: Record<string, unknown>) =>
    [...financeKeys.all(churchId), kind, 'list', params] as const,
  detail: (churchId: string, kind: string, id: string) =>
    [...financeKeys.all(churchId), kind, 'detail', id] as const,
  report: (churchId: string, kind: string, params: Record<string, unknown>) =>
    [...financeKeys.all(churchId), 'report', kind, params] as const,
};

type Params<T> = Partial<{ [K in keyof T]: T[K] }>;

/** Drops empty values so they neither reach the URL nor split the cache. */
const clean = <T extends Record<string, unknown>>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== '' && value !== null,
    ),
  ) as Partial<T>;

const path = (churchId: string, rest = '') => `/churches/${churchId}/finance${rest}`;

// ---- Queries -----------------------------------------------------------------------------------

export const financeSetupQuery = (churchId: string) =>
  queryOptions({
    queryKey: financeKeys.setup(churchId),
    queryFn: () => request(financeSetupSchema, { url: path(churchId, '/setup') }),
    staleTime: 60_000,
  });

export const financeSummaryQuery = (churchId: string) =>
  queryOptions({
    queryKey: financeKeys.summary(churchId),
    queryFn: () => request(financeSummarySchema, { url: path(churchId, '/summary') }),
  });

export const financePendingQuery = (churchId: string) =>
  queryOptions({
    queryKey: financeKeys.pending(churchId),
    queryFn: () => request(financePendingSchema, { url: path(churchId, '/pending') }),
  });

export type OfferingListParams = Params<
  Pick<OfferingBatchListQuery, 'q' | 'page' | 'limit' | 'status' | 'from' | 'to' | 'sort'>
>;
export const offeringsQuery = (churchId: string, params: OfferingListParams) =>
  queryOptions({
    queryKey: financeKeys.list(churchId, 'offerings', clean(params)),
    queryFn: () =>
      request(offeringBatchListSchema, {
        url: path(churchId, '/offerings'),
        params: clean(params),
      }),
  });

/** Worship services of a day, to link a count to (empty when the worship module is off). */
export const offeringServicesQuery = (churchId: string, date: string) =>
  queryOptions({
    queryKey: financeKeys.list(churchId, 'offering-services', { date }),
    queryFn: () =>
      request(offeringServiceListSchema, {
        url: path(churchId, '/offerings/services'),
        params: { date },
      }),
    staleTime: 60_000,
  });

export const offeringQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: financeKeys.detail(churchId, 'offerings', id),
    queryFn: () =>
      request(offeringBatchResponseSchema, { url: path(churchId, `/offerings/${id}`) }),
  });

export type ContributionListParams = Params<
  Pick<
    FinanceContributionListQuery,
    | 'q'
    | 'page'
    | 'limit'
    | 'kind'
    | 'fundId'
    | 'method'
    | 'from'
    | 'to'
    | 'sort'
    | 'campaignId'
    | 'personId'
  >
> & { includeVoided?: 'true' | 'false' };
export const contributionsQuery = (churchId: string, params: ContributionListParams) =>
  queryOptions({
    queryKey: financeKeys.list(churchId, 'contributions', clean(params)),
    queryFn: () =>
      request(financeContributionListSchema, {
        url: path(churchId, '/contributions'),
        params: clean(params),
      }),
  });

export const contributionQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: financeKeys.detail(churchId, 'contributions', id),
    queryFn: () =>
      request(financeContributionResponseSchema, { url: path(churchId, `/contributions/${id}`) }),
  });

export type ExpenseListParams = Params<
  Pick<ExpenseRequestListQuery, 'q' | 'page' | 'limit' | 'status' | 'categoryId' | 'sort'>
> & { mine?: 'true' | 'false' };
export const expensesQuery = (churchId: string, params: ExpenseListParams) =>
  queryOptions({
    queryKey: financeKeys.list(churchId, 'expenses', clean(params)),
    queryFn: () =>
      request(expenseRequestListSchema, {
        url: path(churchId, '/expenses'),
        params: clean(params),
      }),
  });

export const expenseQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: financeKeys.detail(churchId, 'expenses', id),
    queryFn: () =>
      request(expenseRequestResponseSchema, { url: path(churchId, `/expenses/${id}`) }),
  });

export type EntryListParams = Params<
  Pick<
    FinanceEntryListQuery,
    'q' | 'page' | 'limit' | 'from' | 'to' | 'accountId' | 'fundId' | 'sourceType' | 'direction'
  >
> & { includeVoided?: 'true' | 'false' };
export const entriesQuery = (churchId: string, params: EntryListParams) =>
  queryOptions({
    queryKey: financeKeys.list(churchId, 'entries', clean(params)),
    queryFn: () =>
      request(financeEntryListSchema, { url: path(churchId, '/entries'), params: clean(params) }),
  });

export const transfersQuery = (churchId: string, params: { page?: number; accountId?: string }) =>
  queryOptions({
    queryKey: financeKeys.list(churchId, 'transfers', clean(params)),
    queryFn: () =>
      request(financeTransferListSchema, {
        url: path(churchId, '/transfers'),
        params: clean(params),
      }),
  });

export const budgetQuery = (churchId: string, year: number) =>
  queryOptions({
    queryKey: financeKeys.detail(churchId, 'budget', String(year)),
    queryFn: () =>
      request(financeBudgetListSchema, { url: path(churchId, '/budgets'), params: { year } }),
  });

export const campaignsQuery = (churchId: string, status?: string) =>
  queryOptions({
    queryKey: financeKeys.list(churchId, 'campaigns', clean({ status })),
    queryFn: () =>
      request(financeCampaignListSchema, {
        url: path(churchId, '/campaigns'),
        params: clean({ status }),
      }),
  });

export const campaignQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: financeKeys.detail(churchId, 'campaigns', id),
    queryFn: () =>
      request(financeCampaignDetailSchema, { url: path(churchId, `/campaigns/${id}`) }),
  });

export const periodsQuery = (churchId: string, year: number) =>
  queryOptions({
    queryKey: financeKeys.detail(churchId, 'periods', String(year)),
    queryFn: () =>
      request(financePeriodListSchema, { url: path(churchId, '/periods'), params: { year } }),
  });

export type ReportParams = { from: string; to: string; fundId?: string; accountId?: string };
export const reportQuery = (churchId: string, kind: FinanceReportKind, params: ReportParams) =>
  queryOptions({
    queryKey: financeKeys.report(churchId, kind, clean(params)),
    queryFn: () =>
      request(financeReportSchema, {
        url: path(churchId, `/reports/${kind}`),
        params: clean(params),
      }),
  });

export const givingStatementsQuery = (
  churchId: string,
  params: { year: number; q?: string; page?: number; limit?: number },
) =>
  queryOptions({
    queryKey: financeKeys.list(churchId, 'statements', clean(params)),
    queryFn: () =>
      request(givingStatementListSchema, {
        url: path(churchId, '/giving-statements'),
        params: clean(params),
      }),
  });

export const givingStatementQuery = (churchId: string, personId: string, year: number) =>
  queryOptions({
    queryKey: financeKeys.detail(churchId, 'statement', `${personId}:${year}`),
    queryFn: () =>
      request(givingStatementResponseSchema, {
        url: path(churchId, `/giving-statements/${personId}`),
        params: { year },
      }),
  });

export const myGivingQuery = (churchId: string, year: number) =>
  queryOptions({
    queryKey: financeKeys.detail(churchId, 'my-giving', String(year)),
    queryFn: () => request(myGivingSchema, { url: path(churchId, '/my-giving'), params: { year } }),
  });

export const donorsQuery = (churchId: string, q: string) =>
  queryOptions({
    queryKey: financeKeys.list(churchId, 'donors', { q }),
    queryFn: () =>
      request(financeDonorListSchema, {
        url: path(churchId, '/donors'),
        params: clean({ q, limit: 20 }),
      }),
    staleTime: 30_000,
  });

export const membersQuery = (churchId: string, q: string) =>
  queryOptions({
    queryKey: financeKeys.list(churchId, 'members', { q }),
    queryFn: () =>
      request(financeMemberListSchema, {
        url: path(churchId, '/members'),
        params: clean({ q, limit: 20 }),
      }),
    staleTime: 30_000,
  });

/** Downloads a CSV export with the session token (a plain link would not send it). */
export async function downloadCsv(url: string, params: Record<string, unknown>, filename: string) {
  const response = await api.get<Blob>(url, {
    params: { ...clean(params), format: 'csv' },
    responseType: 'blob',
  });
  const href = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const csvUrl = path;

// ---- Mutations ---------------------------------------------------------------------------------

/**
 * After any finance write: the whole module (one ledger feeds every screen), the home dashboard
 * and the notification inbox (verifiers and requesters are notified).
 */
export const invalidateFinance = (client: QueryClient, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: financeKeys.all(churchId) }),
    client.invalidateQueries({ queryKey: keys.dashboard(churchId) }),
    client.invalidateQueries({
      predicate: (query) => query.queryKey.some((part) => part === 'notifications'),
    }),
  ]);

function useFinanceMutation<TVariables, TData>(
  churchId: string,
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => invalidateFinance(client, churchId),
  });
}

type Input<T extends z.ZodType> = z.input<T>;

export const useFinanceDefaults = (churchId: string) =>
  useFinanceMutation(churchId, (body: Input<typeof financeDefaultsBodySchema>) =>
    request(financeSetupSchema.extend({ created: z.unknown() }), {
      method: 'POST',
      url: path(churchId, '/setup/defaults'),
      data: financeDefaultsBodySchema.parse(body),
    }),
  );

const crud = <TInput extends z.ZodType, TResponse>(
  segment: string,
  input: TInput,
  response: z.ZodType<TResponse>,
) => ({
  useSave: (churchId: string) =>
    useFinanceMutation(churchId, ({ id, ...body }: Input<TInput> & { id?: string }) =>
      request(response, {
        method: id ? 'PATCH' : 'POST',
        url: path(churchId, id ? `/${segment}/${id}` : `/${segment}`),
        data: input.parse(body),
      }),
    ),
  useDelete: (churchId: string) =>
    useFinanceMutation(churchId, (id: string) =>
      request(okSchema, { method: 'DELETE', url: path(churchId, `/${segment}/${id}`) }),
    ),
});

export const funds = crud('funds', financeFundInputSchema, financeFundResponseSchema);
export const accounts = crud('accounts', financeAccountInputSchema, financeAccountResponseSchema);
export const categories = crud(
  'categories',
  financeCategoryInputSchema,
  financeCategoryResponseSchema,
);
export const campaigns = crud(
  'campaigns',
  financeCampaignInputSchema,
  financeCampaignResponseSchema,
);

export const useSaveOffering = (churchId: string) =>
  useFinanceMutation(
    churchId,
    ({ id, ...body }: Input<typeof offeringBatchInputSchema> & { id?: string }) =>
      request(offeringBatchResponseSchema, {
        method: id ? 'PATCH' : 'POST',
        url: path(churchId, id ? `/offerings/${id}` : '/offerings'),
        data: offeringBatchInputSchema.parse(body),
      }),
  );

export type OfferingAction = 'submit' | 'return' | 'verify' | 'void';
export const useOfferingAction = (churchId: string, id: string) =>
  useFinanceMutation(churchId, ({ action, reason }: { action: OfferingAction; reason?: string }) =>
    request(offeringBatchResponseSchema, {
      method: 'POST',
      url: path(churchId, `/offerings/${id}/${action}`),
      data: action === 'return' || action === 'void' ? { reason: reason ?? null } : undefined,
    }),
  );

export const useSaveContribution = (churchId: string) =>
  useFinanceMutation(
    churchId,
    ({ id, ...body }: Input<typeof financeContributionInputSchema> & { id?: string }) =>
      request(financeContributionResponseSchema, {
        method: id ? 'PATCH' : 'POST',
        url: path(churchId, id ? `/contributions/${id}` : '/contributions'),
        data: financeContributionInputSchema.parse(body),
      }),
  );

export const useVoidContribution = (churchId: string, id: string) =>
  useFinanceMutation(churchId, (reason: string) =>
    request(financeContributionResponseSchema, {
      method: 'POST',
      url: path(churchId, `/contributions/${id}/void`),
      data: { reason },
    }),
  );

export const useSaveExpense = (churchId: string) =>
  useFinanceMutation(
    churchId,
    ({ id, ...body }: Input<typeof expenseRequestInputSchema> & { id?: string }) =>
      request(expenseRequestResponseSchema, {
        method: id ? 'PATCH' : 'POST',
        url: path(churchId, id ? `/expenses/${id}` : '/expenses'),
        data: expenseRequestInputSchema.parse(body),
      }),
  );

export type ExpenseAction =
  | { action: 'submit' }
  | { action: 'decide'; body: DecideExpenseBody }
  | { action: 'pay'; body: PayExpenseBody }
  | { action: 'reverse-payment'; body: { reason: string } }
  | { action: 'cancel'; body: { reason: string | null } };
export const useExpenseAction = (churchId: string, id: string) =>
  useFinanceMutation(churchId, (variables: ExpenseAction) =>
    request(expenseRequestResponseSchema, {
      method: 'POST',
      url: path(churchId, `/expenses/${id}/${variables.action}`),
      data: 'body' in variables ? variables.body : undefined,
    }),
  );

export const useSaveAdjustment = (churchId: string) =>
  useFinanceMutation(churchId, (body: Input<typeof financeAdjustmentInputSchema>) =>
    request(financeEntryResponseSchema, {
      method: 'POST',
      url: path(churchId, '/adjustments'),
      data: financeAdjustmentInputSchema.parse(body),
    }),
  );

export const useVoidEntry = (churchId: string) =>
  useFinanceMutation(churchId, ({ id, reason }: { id: string; reason: string }) =>
    request(financeEntryResponseSchema, {
      method: 'POST',
      url: path(churchId, `/entries/${id}/void`),
      data: { reason },
    }),
  );

export const useSaveTransfer = (churchId: string) =>
  useFinanceMutation(churchId, (body: Input<typeof financeTransferInputSchema>) =>
    request(financeTransferResponseSchema, {
      method: 'POST',
      url: path(churchId, '/transfers'),
      data: financeTransferInputSchema.parse(body),
    }),
  );

export const useVoidTransfer = (churchId: string) =>
  useFinanceMutation(churchId, ({ id, reason }: { id: string; reason: string }) =>
    request(financeTransferResponseSchema, {
      method: 'POST',
      url: path(churchId, `/transfers/${id}/void`),
      data: { reason },
    }),
  );

export const useSaveBudget = (churchId: string) =>
  useFinanceMutation(churchId, (body: Input<typeof saveBudgetBodySchema>) =>
    request(financeBudgetListSchema, {
      method: 'PUT',
      url: path(churchId, '/budgets'),
      data: saveBudgetBodySchema.parse(body),
    }),
  );

export const useSavePledge = (churchId: string, campaignId: string) =>
  useFinanceMutation(
    churchId,
    ({ id, ...body }: Input<typeof financePledgeInputSchema> & { id?: string }) =>
      request(financePledgeResponseSchema, {
        method: id ? 'PATCH' : 'POST',
        url: path(
          churchId,
          id ? `/campaigns/${campaignId}/pledges/${id}` : `/campaigns/${campaignId}/pledges`,
        ),
        data: financePledgeInputSchema.parse(body),
      }),
  );

export const useDeletePledge = (churchId: string, campaignId: string) =>
  useFinanceMutation(churchId, (id: string) =>
    request(okSchema, {
      method: 'DELETE',
      url: path(churchId, `/campaigns/${campaignId}/pledges/${id}`),
    }),
  );

export const usePeriodAction = (churchId: string) =>
  useFinanceMutation(
    churchId,
    ({
      year,
      month,
      action,
      reason,
    }: {
      year: number;
      month: number;
      action: 'close' | 'reopen';
      reason?: string;
    }) =>
      request(financePeriodResponseSchema, {
        method: 'POST',
        url: path(churchId, `/periods/${year}/${month}/${action}`),
        data: action === 'reopen' ? { reason } : undefined,
      }),
  );
