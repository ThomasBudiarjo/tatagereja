import {
  canApproveExpense,
  canVerifyOfferingBatch,
  fullName,
  type AccessLike,
  type ExpenseRequest,
  type FinanceAccount,
  type FinanceCampaign,
  type FinanceCategory,
  type FinanceContribution,
  type FinanceEntry,
  type FinanceFund,
  type FinancePledge,
  type FinanceTransfer,
  type OfferingBatch,
  type PersonSummary,
} from '@tatagereja/shared';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import type { Queryable } from '../../db/client';
import type {
  ExpenseRequestRow,
  FinanceAccountRow,
  FinanceCampaignRow,
  FinanceCategoryRow,
  FinanceContributionRow,
  FinanceEntryRow,
  FinanceFundRow,
  FinancePledgeRow,
  FinanceTransferRow,
  OfferingBatchRow,
  PersonRow,
} from '../../db/schema';
import {
  financeAccounts,
  financeCampaigns,
  financeCategories,
  financeContributions,
  financeFunds,
  financePledges,
  offeringBatchLines,
  people,
} from '../../db/schema';
import { toPersonSummary } from '../../serializers';
import { sumOf, userNames } from '../../services/finance';

export const toFund = (row: FinanceFundRow, balance: number | null): FinanceFund => ({
  id: row.id,
  name: row.name,
  code: row.code,
  description: row.description,
  isRestricted: row.isRestricted,
  isActive: row.isActive,
  sortOrder: row.sortOrder,
  balance,
});

/** `balance` is null for callers without `finance.view`, the opening balance unless `showOpening`. */
export const toAccount = (
  row: FinanceAccountRow,
  balance: number | null,
  showOpening: boolean,
): FinanceAccount => ({
  id: row.id,
  name: row.name,
  type: row.type,
  bankName: row.bankName,
  accountNumber: row.accountNumber,
  openingBalance: showOpening ? row.openingBalance : null,
  openingDate: row.openingDate,
  isActive: row.isActive,
  balance,
});

export const toCategory = (row: FinanceCategoryRow): FinanceCategory => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  code: row.code,
  isActive: row.isActive,
  sortOrder: row.sortOrder,
});

type Names = {
  funds: Map<string, string>;
  accounts: Map<string, string>;
  categories: Map<string, string>;
};

/** Names of every fund, account and category of a church (small tables, one query each). */
export function setupNames(db: Queryable, churchId: string): Names {
  const map = (rows: { id: string; name: string }[]) =>
    new Map(rows.map((row) => [row.id, row.name]));
  return {
    funds: map(
      db
        .select({ id: financeFunds.id, name: financeFunds.name })
        .from(financeFunds)
        .where(eq(financeFunds.churchId, churchId))
        .all(),
    ),
    accounts: map(
      db
        .select({ id: financeAccounts.id, name: financeAccounts.name })
        .from(financeAccounts)
        .where(eq(financeAccounts.churchId, churchId))
        .all(),
    ),
    categories: map(
      db
        .select({ id: financeCategories.id, name: financeCategories.name })
        .from(financeCategories)
        .where(eq(financeCategories.churchId, churchId))
        .all(),
    ),
  };
}

const personSummaries = (db: Queryable, ids: (string | null)[]): Map<string, PersonSummary> => {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  return new Map(
    db
      .select()
      .from(people)
      .where(inArray(people.id, unique))
      .all()
      .map((row: PersonRow) => [row.id, toPersonSummary(row)]),
  );
};

export function hydrateEntries(
  db: Queryable,
  churchId: string,
  rows: FinanceEntryRow[],
  running?: Map<string, number>,
): FinanceEntry[] {
  if (rows.length === 0) return [];
  const names = setupNames(db, churchId);
  return rows.map((row) => ({
    id: row.id,
    entryDate: row.entryDate,
    accountId: row.accountId,
    accountName: names.accounts.get(row.accountId) ?? '—',
    fundId: row.fundId,
    fundName: names.funds.get(row.fundId) ?? '—',
    categoryId: row.categoryId,
    categoryName: row.categoryId ? (names.categories.get(row.categoryId) ?? null) : null,
    amount: row.amount,
    description: row.description,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    runningBalance: running?.get(row.id) ?? null,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
  }));
}

export function hydrateBatches(
  db: Queryable,
  churchId: string,
  access: AccessLike,
  rows: OfferingBatchRow[],
): OfferingBatch[] {
  if (rows.length === 0) return [];
  const names = setupNames(db, churchId);
  const lines = db
    .select()
    .from(offeringBatchLines)
    .where(
      and(
        eq(offeringBatchLines.churchId, churchId),
        inArray(
          offeringBatchLines.batchId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(offeringBatchLines.position))
    .all();
  const people = userNames(
    db,
    rows.flatMap((row) => [row.verifiedBy, row.createdBy, row.counter1UserId, row.counter2UserId]),
  );
  return rows.map((row) => ({
    id: row.id,
    serviceDate: row.serviceDate,
    worshipServiceId: row.worshipServiceId,
    serviceLabel: row.serviceLabel,
    accountId: row.accountId,
    accountName: names.accounts.get(row.accountId) ?? '—',
    status: row.status,
    totalAmount: row.totalAmount,
    lines: lines
      .filter((line) => line.batchId === row.id)
      .map((line) => ({
        id: line.id,
        fundId: line.fundId,
        fundName: names.funds.get(line.fundId) ?? '—',
        categoryId: line.categoryId,
        categoryName: line.categoryId ? (names.categories.get(line.categoryId) ?? null) : null,
        method: line.method,
        accountId: line.accountId,
        accountName: line.accountId ? (names.accounts.get(line.accountId) ?? null) : null,
        amount: line.amount,
        denominations: line.denominations ?? {},
        note: line.note,
      })),
    counter1UserId: row.counter1UserId,
    // Counters picked from the members show their account name.
    counter1Name:
      row.counter1Name ?? (row.counter1UserId ? (people.get(row.counter1UserId) ?? null) : null),
    counter2UserId: row.counter2UserId,
    counter2Name:
      row.counter2Name ?? (row.counter2UserId ? (people.get(row.counter2UserId) ?? null) : null),
    notes: row.notes,
    submittedAt: row.submittedAt,
    submittedBy: row.submittedBy,
    updatedBy: row.updatedBy,
    verifiedBy: row.verifiedBy,
    verifiedByName: row.verifiedBy ? (people.get(row.verifiedBy) ?? null) : null,
    verifiedAt: row.verifiedAt,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdBy: row.createdBy,
    createdByName: row.createdBy ? (people.get(row.createdBy) ?? null) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canVerify: row.status === 'submitted' && canVerifyOfferingBatch(access, row),
  }));
}

export function hydrateContributions(
  db: Queryable,
  churchId: string,
  rows: FinanceContributionRow[],
): FinanceContribution[] {
  if (rows.length === 0) return [];
  const names = setupNames(db, churchId);
  const persons = personSummaries(
    db,
    rows.map((row) => row.personId),
  );
  const recorders = userNames(
    db,
    rows.map((row) => row.recordedBy),
  );
  const campaignIds = [...new Set(rows.flatMap((row) => (row.campaignId ? [row.campaignId] : [])))];
  const campaigns = new Map(
    campaignIds.length
      ? db
          .select({ id: financeCampaigns.id, name: financeCampaigns.name })
          .from(financeCampaigns)
          .where(inArray(financeCampaigns.id, campaignIds))
          .all()
          .map((row) => [row.id, row.name])
      : [],
  );
  return rows.map((row) => ({
    id: row.id,
    person: row.personId ? (persons.get(row.personId) ?? null) : null,
    donorName: row.donorName,
    kind: row.kind,
    fundId: row.fundId,
    fundName: names.funds.get(row.fundId) ?? '—',
    accountId: row.accountId,
    accountName: names.accounts.get(row.accountId) ?? '—',
    categoryId: row.categoryId,
    categoryName: row.categoryId ? (names.categories.get(row.categoryId) ?? null) : null,
    campaignId: row.campaignId,
    campaignName: row.campaignId ? (campaigns.get(row.campaignId) ?? null) : null,
    method: row.method,
    amount: row.amount,
    receivedAt: row.receivedAt,
    reference: row.reference,
    receiptNumber: row.receiptNumber,
    note: row.note,
    recordedBy: row.recordedBy,
    recordedByName: row.recordedBy ? (recorders.get(row.recordedBy) ?? null) : null,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
  }));
}

export function hydrateExpenses(
  db: Queryable,
  churchId: string,
  access: AccessLike,
  rows: ExpenseRequestRow[],
): ExpenseRequest[] {
  if (rows.length === 0) return [];
  const names = setupNames(db, churchId);
  const persons = personSummaries(
    db,
    rows.map((row) => row.reimbursePersonId),
  );
  const accounts = userNames(
    db,
    rows.flatMap((row) => [row.requestedBy, row.decidedBy, row.paidBy]),
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: names.categories.get(row.categoryId) ?? '—',
    fundId: row.fundId,
    fundName: names.funds.get(row.fundId) ?? '—',
    amount: row.amount,
    payeeName: row.payeeName,
    neededBy: row.neededBy,
    attachmentUrls: Array.isArray(row.attachmentUrls) ? row.attachmentUrls : [],
    isReimbursement: row.isReimbursement,
    reimbursePerson: row.reimbursePersonId ? (persons.get(row.reimbursePersonId) ?? null) : null,
    status: row.status,
    requestedBy: row.requestedBy,
    requesterName: row.requestedBy ? (accounts.get(row.requestedBy) ?? null) : null,
    submittedAt: row.submittedAt,
    decidedBy: row.decidedBy,
    decidedByName: row.decidedBy ? (accounts.get(row.decidedBy) ?? null) : null,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    paidAt: row.paidAt,
    paidByName: row.paidBy ? (accounts.get(row.paidBy) ?? null) : null,
    paidFromAccountId: row.paidFromAccountId,
    paidFromAccountName: row.paidFromAccountId
      ? (names.accounts.get(row.paidFromAccountId) ?? null)
      : null,
    paymentReference: row.paymentReference,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canApprove: row.status === 'submitted' && canApproveExpense(access, row),
  }));
}

export function hydrateCampaigns(
  db: Queryable,
  churchId: string,
  rows: FinanceCampaignRow[],
): FinanceCampaign[] {
  if (rows.length === 0) return [];
  const names = setupNames(db, churchId);
  const ids = rows.map((row) => row.id);
  const received = new Map<string, number>();
  for (const row of liveCampaignTotals(db, churchId, ids)) {
    if (row.campaignId)
      received.set(row.campaignId, (received.get(row.campaignId) ?? 0) + row.total);
  }
  const pledged = new Map(
    db
      .select({
        campaignId: financePledges.campaignId,
        total: sumOf(financePledges.amount),
        count: count(),
      })
      .from(financePledges)
      .where(and(eq(financePledges.churchId, churchId), inArray(financePledges.campaignId, ids)))
      .groupBy(financePledges.campaignId)
      .all()
      .map((row) => [row.campaignId, row]),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    fundId: row.fundId,
    fundName: names.funds.get(row.fundId) ?? '—',
    targetAmount: row.targetAmount,
    pledgedAmount: pledged.get(row.id)?.total ?? 0,
    receivedAmount: received.get(row.id) ?? 0,
    pledgeCount: pledged.get(row.id)?.count ?? 0,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
  }));
}

/** Live (not voided) contribution totals per campaign and person. */
export function liveCampaignTotals(db: Queryable, churchId: string, campaignIds: string[]) {
  if (campaignIds.length === 0) return [];
  return db
    .select({
      campaignId: financeContributions.campaignId,
      personId: financeContributions.personId,
      total: sumOf(financeContributions.amount),
    })
    .from(financeContributions)
    .where(
      and(
        eq(financeContributions.churchId, churchId),
        inArray(financeContributions.campaignId, campaignIds),
        isNull(financeContributions.voidedAt),
      ),
    )
    .groupBy(financeContributions.campaignId, financeContributions.personId)
    .all();
}

export function hydratePledges(
  db: Queryable,
  churchId: string,
  rows: FinancePledgeRow[],
): FinancePledge[] {
  if (rows.length === 0) return [];
  const campaignIds = [...new Set(rows.map((row) => row.campaignId))];
  const campaigns = new Map(
    db
      .select({ id: financeCampaigns.id, name: financeCampaigns.name })
      .from(financeCampaigns)
      .where(inArray(financeCampaigns.id, campaignIds))
      .all()
      .map((row) => [row.id, row.name]),
  );
  const paid = new Map<string, number>();
  for (const row of liveCampaignTotals(db, churchId, campaignIds)) {
    if (row.campaignId && row.personId) paid.set(`${row.campaignId}:${row.personId}`, row.total);
  }
  const persons = personSummaries(
    db,
    rows.map((row) => row.personId),
  );
  return rows.map((row) => ({
    id: row.id,
    campaignId: row.campaignId,
    campaignName: campaigns.get(row.campaignId) ?? '—',
    person: row.personId ? (persons.get(row.personId) ?? null) : null,
    donorName: row.donorName,
    amount: row.amount,
    paidAmount: row.personId ? (paid.get(`${row.campaignId}:${row.personId}`) ?? 0) : 0,
    note: row.note,
    createdAt: row.createdAt,
  }));
}

export function hydrateTransfers(
  db: Queryable,
  churchId: string,
  rows: FinanceTransferRow[],
): FinanceTransfer[] {
  if (rows.length === 0) return [];
  const names = setupNames(db, churchId);
  return rows.map((row) => ({
    id: row.id,
    fromAccountId: row.fromAccountId,
    fromAccountName: names.accounts.get(row.fromAccountId) ?? '—',
    toAccountId: row.toAccountId,
    toAccountName: names.accounts.get(row.toAccountId) ?? '—',
    fundId: row.fundId,
    fundName: names.funds.get(row.fundId) ?? '—',
    amount: row.amount,
    transferDate: row.transferDate,
    note: row.note,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
  }));
}

/** "Budi Santoso" or the donor name, "NN" for anonymous gifts. */
export const donorLabel = (person: PersonSummary | null, donorName: string | null): string =>
  person ? fullName(person) : (donorName ?? 'NN');
