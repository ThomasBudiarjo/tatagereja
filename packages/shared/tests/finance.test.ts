import { describe, expect, it } from 'bun:test';
import {
  shiftDate,
  budgetUsage,
  canCancelExpense,
  canDecideExpense,
  canEditExpense,
  canEditOfferingBatch,
  canPayExpense,
  canReturnOfferingBatch,
  canVerifyOfferingBatch,
  canViewAllExpenses,
  canViewGivingOf,
  canVoidOfferingBatch,
  expenseRequestInputSchema,
  monthRange,
  offeringBatchInputSchema,
  progressRatio,
  type AccessLike,
  type Permission,
} from '../src';

const access = (
  permissions: readonly Permission[],
  userId = 'u1',
  personId: string | null = null,
): AccessLike => ({ userId, role: 'member', leaderGroupIds: [], personId, permissions });

const batch = {
  status: 'submitted' as const,
  counter1UserId: 'u1',
  counter2UserId: null,
  createdBy: 'u2',
  submittedBy: 'u3',
  updatedBy: 'u4',
};

describe('finance access rules', () => {
  it('keeps everyone who touched a count from verifying it', () => {
    for (const userId of ['u1', 'u2', 'u3', 'u4']) {
      expect(canVerifyOfferingBatch(access(['finance.approve'], userId), batch)).toBe(false);
    }
    expect(canVerifyOfferingBatch(access(['finance.approve'], 'u5'), batch)).toBe(true);
    expect(canVerifyOfferingBatch(access(['finance.record'], 'u5'), batch)).toBe(false);
  });

  it('follows the offering status', () => {
    expect(canEditOfferingBatch(access(['finance.record']), { ...batch, status: 'draft' })).toBe(
      true,
    );
    expect(canEditOfferingBatch(access(['finance.record']), batch)).toBe(false);
    expect(canReturnOfferingBatch(access(['finance.approve']), batch)).toBe(true);
    expect(canVoidOfferingBatch(access(['finance.record'], 'u2'), batch)).toBe(true);
    expect(
      canVoidOfferingBatch(access(['finance.record'], 'u2'), { ...batch, status: 'verified' }),
    ).toBe(false);
    expect(canVoidOfferingBatch(access(['finance.manage']), { ...batch, status: 'verified' })).toBe(
      true,
    );
    expect(canVoidOfferingBatch(access(['finance.manage']), { ...batch, status: 'voided' })).toBe(
      false,
    );
  });

  it('runs the expense workflow with segregation of duties', () => {
    const draft = { status: 'draft' as const, requestedBy: 'u1' };
    expect(canEditExpense(access(['finance.record']), draft)).toBe(true);
    expect(canEditExpense(access(['finance.record'], 'u2'), draft)).toBe(false);
    expect(canEditExpense(access(['finance.manage'], 'u2'), draft)).toBe(true);
    const submitted = { ...draft, status: 'submitted' as const };
    expect(canDecideExpense(access(['finance.approve']), submitted)).toBe(false);
    expect(canDecideExpense(access(['finance.approve'], 'u2'), submitted)).toBe(true);
    expect(canPayExpense(access(['finance.record'], 'u2'), { ...draft, status: 'approved' })).toBe(
      true,
    );
    expect(canPayExpense(access(['finance.view'], 'u2'), { ...draft, status: 'approved' })).toBe(
      false,
    );
    expect(canCancelExpense(access(['finance.record']), submitted)).toBe(true);
    expect(canCancelExpense(access(['finance.record']), { ...draft, status: 'paid' })).toBe(false);
    expect(canViewAllExpenses(access(['finance.record']))).toBe(false);
    expect(canViewAllExpenses(access(['finance.approve']))).toBe(true);
  });

  it('shows giving to the giver or finance reports', () => {
    expect(canViewGivingOf(access([], 'u1', 'p1'), 'p1')).toBe(true);
    expect(canViewGivingOf(access([], 'u1', 'p1'), 'p2')).toBe(false);
    expect(canViewGivingOf(access(['finance.reports']), 'p2')).toBe(true);
  });
});

describe('finance helpers and schemas', () => {
  it('computes month ranges, budget usage and progress', () => {
    expect(monthRange(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange(2028, 2).to).toBe('2028-02-29');
    expect(budgetUsage(0, 10)).toBeNull();
    expect(budgetUsage(200, 50)).toBe(0.25);
    expect(progressRatio(100, 250)).toBe(1);
    expect(shiftDate('2026-02-27', 3)).toBe('2026-03-02');
  });

  it('refuses counters with the same name and reimbursements without a person', () => {
    const base = {
      serviceDate: '2026-10-18',
      accountId: crypto.randomUUID(),
      lines: [{ fundId: crypto.randomUUID(), amount: 1000 }],
      counter1Name: 'Budi',
      counter2Name: 'budi',
    };
    expect(offeringBatchInputSchema.safeParse(base).success).toBe(false);
    expect(offeringBatchInputSchema.safeParse({ ...base, counter2Name: 'Sari' }).success).toBe(
      true,
    );
    const expense = {
      title: 'Bensin',
      categoryId: crypto.randomUUID(),
      fundId: crypto.randomUUID(),
      amount: 10,
      isReimbursement: true,
    };
    expect(expenseRequestInputSchema.safeParse(expense).success).toBe(false);
    expect(
      expenseRequestInputSchema.safeParse({ ...expense, reimbursePersonId: crypto.randomUUID() })
        .success,
    ).toBe(true);
  });
});
