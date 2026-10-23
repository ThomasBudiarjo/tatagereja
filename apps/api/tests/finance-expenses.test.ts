import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp, seedChurch } from './helpers';
import {
  financeAudit,
  memberWithRole,
  notificationsOf,
  otherChurch,
  setupFinance,
  type Member,
  type Seed,
} from './finance-helpers';

describe('finance expenses, budgets and campaigns', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Seed;
  let f: Awaited<ReturnType<typeof setupFinance>>;
  let requester: Member;
  let approver: Member;
  let treasurer: Member;
  let viewer: Member;

  const request = (overrides: Record<string, unknown> = {}) => ({
    title: 'Konsumsi rapat Majelis',
    categoryId: f.category('Pelayanan & Ibadah'),
    fundId: f.general,
    amount: 750_000,
    payeeName: 'Katering Berkat',
    attachmentUrls: ['https://example.com/nota.jpg'],
    ...overrides,
  });

  beforeAll(async () => {
    s = await seedChurch(t);
    f = await setupFinance(t, s);
    requester = await memberWithRole(t, s, 'Requester', ['finance.record']);
    approver = await memberWithRole(t, s, 'Approver', ['finance.approve', 'finance.record']);
    treasurer = await memberWithRole(t, s, 'Treasurer', [
      'finance.view',
      'finance.record',
      'finance.manage',
    ]);
    viewer = await memberWithRole(t, s, 'Viewer', ['finance.view']);
  });

  describe('expense workflow', () => {
    let expenseId = '';

    it('validates requests', async () => {
      const income = await t.request('POST', `${f.base}/expenses`, {
        token: requester.token,
        body: request({ categoryId: f.category('Perpuluhan') }),
      });
      expect(income.status).toBe(400);
      const badUrl = await t.request('POST', `${f.base}/expenses`, {
        token: requester.token,
        body: request({ attachmentUrls: ['javascript:alert(1)'] }),
      });
      expect(badUrl.status).toBe(422);
      const reimbursementWithoutPerson = await t.request('POST', `${f.base}/expenses`, {
        token: requester.token,
        body: request({ isReimbursement: true }),
      });
      expect(reimbursementWithoutPerson.status).toBe(422);
      expect(reimbursementWithoutPerson.json.error.issues[0].path).toBe('reimbursePersonId');
      for (const token of [s.member.token, viewer.token, s.leader.token]) {
        expect(
          (await t.request('POST', `${f.base}/expenses`, { token, body: request() })).status,
        ).toBe(403);
      }
    });

    it('drafts, edits and submits a request, notifying approvers', async () => {
      const created = await t.request('POST', `${f.base}/expenses`, {
        token: requester.token,
        body: request(),
      });
      expect(created.status).toBe(201);
      expect(created.json.expense.status).toBe('draft');
      expect(created.json.expense.requesterName).toBe('Requester');
      expenseId = created.json.expense.id;

      const notOwner = await t.request('PATCH', `${f.base}/expenses/${expenseId}`, {
        token: approver.token,
        body: request({ amount: 1 }),
      });
      // Approvers see every request, but someone else's draft stays the requester's.
      expect(notOwner.status).toBe(403);
      const asApprover = await t.request('GET', `${f.base}/expenses/${expenseId}`, {
        token: approver.token,
      });
      expect(asApprover.status).toBe(200);

      const edited = await t.request('PATCH', `${f.base}/expenses/${expenseId}`, {
        token: requester.token,
        body: request({ amount: 800_000, submit: true }),
      });
      expect(edited.status).toBe(200);
      expect(edited.json.expense.status).toBe('submitted');
      expect(edited.json.expense.amount).toBe(800_000);

      const notices = await notificationsOf(t, approver.token);
      expect(notices.some((n) => n.type === 'finance.expense_submitted')).toBe(true);
      expect(
        (await notificationsOf(t, requester.token)).some(
          (n) => n.type === 'finance.expense_submitted',
        ),
      ).toBe(false);

      const editSubmitted = await t.request('PATCH', `${f.base}/expenses/${expenseId}`, {
        token: requester.token,
        body: request(),
      });
      expect(editSubmitted.status).toBe(409);
    });

    it('keeps requesters from approving their own requests', async () => {
      const own = await t.request('POST', `${f.base}/expenses`, {
        token: approver.token,
        body: request({ title: 'Tinta printer', amount: 150_000, submit: true }),
      });
      expect(own.status).toBe(201);
      expect(own.json.expense.canApprove).toBe(false);
      const self = await t.request('POST', `${f.base}/expenses/${own.json.expense.id}/decide`, {
        token: approver.token,
        body: { decision: 'approved' },
      });
      expect(self.status).toBe(403);
      expect(self.json.error.code).toBe('SELF_APPROVAL');
      const noApprove = await t.request('POST', `${f.base}/expenses/${expenseId}/decide`, {
        token: treasurer.token,
        body: { decision: 'approved' },
      });
      expect(noApprove.status).toBe(403);
      const rejectWithoutNote = await t.request(
        'POST',
        `${f.base}/expenses/${own.json.expense.id}/decide`,
        {
          token: s.owner.token,
          body: { decision: 'rejected' },
        },
      );
      expect(rejectWithoutNote.status).toBe(422);
      const rejected = await t.request('POST', `${f.base}/expenses/${own.json.expense.id}/decide`, {
        token: s.owner.token,
        body: { decision: 'rejected', note: 'Pakai stok kantor' },
      });
      expect(rejected.status).toBe(200);
      expect(rejected.json.expense.status).toBe('rejected');
      const cancelRejected = await t.request(
        'POST',
        `${f.base}/expenses/${own.json.expense.id}/cancel`,
        {
          token: approver.token,
          body: {},
        },
      );
      expect(cancelRejected.status).toBe(409);
    });

    it('approves and pays a request, posting the ledger and telling the requester', async () => {
      const pending = await t.request('GET', `${f.base}/pending`, { token: approver.token });
      expect(pending.json.expenses).toBe(1);
      const payEarly = await t.request('POST', `${f.base}/expenses/${expenseId}/pay`, {
        token: treasurer.token,
        body: { accountId: f.bank, paidAt: '2026-05-04' },
      });
      expect(payEarly.status).toBe(409);

      const approved = await t.request('POST', `${f.base}/expenses/${expenseId}/decide`, {
        token: approver.token,
        body: { decision: 'approved', note: 'Sesuai anggaran' },
      });
      expect(approved.status).toBe(200);
      expect(approved.json.expense.decidedByName).toBe('Approver');
      expect(
        (await notificationsOf(t, requester.token)).some(
          (n) => n.title === 'Pengajuan dana disetujui',
        ),
      ).toBe(true);

      const noPermission = await t.request('POST', `${f.base}/expenses/${expenseId}/pay`, {
        token: viewer.token,
        body: { accountId: f.bank, paidAt: '2026-05-04' },
      });
      expect(noPermission.status).toBe(403);

      const paid = await t.request('POST', `${f.base}/expenses/${expenseId}/pay`, {
        token: treasurer.token,
        body: { accountId: f.bank, paidAt: '2026-05-04', paymentReference: 'TRF-77' },
      });
      expect(paid.status).toBe(200);
      expect(paid.json.expense.status).toBe('paid');
      expect(paid.json.expense.paidFromAccountName).toBe('BCA Gereja');

      const entries = await t.request('GET', `${f.base}/entries?sourceType=expense`, {
        token: viewer.token,
      });
      expect(entries.json.items[0].amount).toBe(-800_000);
      expect(entries.json.items[0].categoryName).toBe('Pelayanan & Ibadah');

      const audit = await financeAudit(t, s, `&entityId=${expenseId}`);
      expect(audit.map((entry) => entry.action)).toEqual([
        'expense.pay',
        'expense.approve',
        'expense.update',
        'expense.create',
      ]);
      expect(audit[2]?.before).toEqual({ amount: 750_000, status: 'draft' });
    });

    it('shows requesters only their own requests', async () => {
      const mine = await t.request('GET', `${f.base}/expenses`, { token: requester.token });
      expect(mine.status).toBe(200);
      expect(
        mine.json.items.every((e: { requestedBy: string }) => e.requestedBy === requester.user.id),
      ).toBe(true);
      const all = await t.request('GET', `${f.base}/expenses`, { token: viewer.token });
      expect(all.json.total).toBe(2);
      const others = await t.request('GET', `${f.base}/expenses?status=rejected`, {
        token: requester.token,
      });
      expect(others.json.total).toBe(0);
      const rejectedId = all.json.items.find((e: { status: string }) => e.status === 'rejected').id;
      expect(
        (await t.request('GET', `${f.base}/expenses/${rejectedId}`, { token: requester.token }))
          .status,
      ).toBe(404);
      expect((await t.request('GET', `${f.base}/expenses`, { token: s.member.token })).status).toBe(
        403,
      );
    });

    it('records reimbursements and lets requesters cancel', async () => {
      const reimbursement = await t.request('POST', `${f.base}/expenses`, {
        token: requester.token,
        body: request({
          title: 'Bensin perkunjungan',
          amount: 120_000,
          payeeName: null,
          isReimbursement: true,
          reimbursePersonId: s.alice.id,
          submit: true,
        }),
      });
      expect(reimbursement.status).toBe(201);
      expect(reimbursement.json.expense.payeeName).toBe('Alice Smith');
      expect(reimbursement.json.expense.reimbursePerson.firstName).toBe('Alice');
      const cancelByOther = await t.request(
        'POST',
        `${f.base}/expenses/${reimbursement.json.expense.id}/cancel`,
        { token: approver.token, body: {} },
      );
      expect(cancelByOther.status).toBe(403);
      const cancelled = await t.request(
        'POST',
        `${f.base}/expenses/${reimbursement.json.expense.id}/cancel`,
        { token: requester.token, body: { reason: 'Sudah dibayar kas wilayah' } },
      );
      expect(cancelled.status).toBe(200);
      expect(cancelled.json.expense.status).toBe('cancelled');

      const other = await otherChurch(t);
      const foreignPerson = await t.createPerson(other.owner.token, other.church.id, {
        firstName: 'X',
      });
      const foreign = await t.request('POST', `${f.base}/expenses`, {
        token: requester.token,
        body: request({ isReimbursement: true, reimbursePersonId: foreignPerson.id }),
      });
      expect(foreign.status).toBe(404);
      const foreignFund = await t.request('POST', `${f.base}/expenses`, {
        token: requester.token,
        body: request({ fundId: other.setup.funds[0]!.id }),
      });
      expect(foreignFund.status).toBe(404);
    });
  });

  describe('budgets (RAPB)', () => {
    it('saves the yearly budget and compares it with actual spending', async () => {
      const denied = await t.request('PUT', `${f.base}/budgets`, {
        token: viewer.token,
        body: { year: 2026, items: [] },
      });
      expect(denied.status).toBe(403);
      const saved = await t.request('PUT', `${f.base}/budgets`, {
        token: treasurer.token,
        body: {
          year: 2026,
          items: [
            { categoryId: f.category('Pelayanan & Ibadah'), amount: 12_000_000 },
            { categoryId: f.category('Perpuluhan'), amount: 60_000_000, notes: 'Target 2026' },
          ],
        },
      });
      expect(saved.status).toBe(200);
      const service = saved.json.items.find(
        (item: { categoryName: string }) => item.categoryName === 'Pelayanan & Ibadah',
      );
      expect(service).toMatchObject({ amount: 12_000_000, actual: 800_000, variance: -11_200_000 });
      expect(saved.json.totals.expense).toEqual({ budget: 12_000_000, actual: 800_000 });
      expect(saved.json.totals.income.budget).toBe(60_000_000);

      const duplicate = await t.request('PUT', `${f.base}/budgets`, {
        token: treasurer.token,
        body: {
          year: 2026,
          items: [
            { categoryId: f.category('Honorarium'), amount: 1 },
            { categoryId: f.category('Honorarium'), amount: 2 },
          ],
        },
      });
      expect(duplicate.status).toBe(422);

      const cleared = await t.request('PUT', `${f.base}/budgets`, {
        token: treasurer.token,
        body: { year: 2026, items: [{ categoryId: f.category('Perpuluhan'), amount: 0 }] },
      });
      expect(cleared.json.totals.income.budget).toBe(0);
      const audit = await financeAudit(t, s, '&action=budget.update');
      expect(audit).toHaveLength(2);
      expect(audit[0]?.after).toEqual({ [f.category('Perpuluhan')]: 0 });

      const read = await t.request('GET', `${f.base}/budgets?year=2026`, { token: viewer.token });
      expect(read.status).toBe(200);
      expect(
        (await t.request('GET', `${f.base}/budgets?year=2026`, { token: s.member.token })).status,
      ).toBe(403);

      const other = await otherChurch(t);
      const foreign = await t.request('PUT', `${f.base}/budgets`, {
        token: treasurer.token,
        body: { year: 2026, items: [{ categoryId: other.setup.categories[0]!.id, amount: 1 }] },
      });
      expect(foreign.status).toBe(404);
    });
  });

  describe('campaigns and pledges', () => {
    it('tracks pledges and contributions towards a target', async () => {
      const campaign = await t.request('POST', `${f.base}/campaigns`, {
        token: treasurer.token,
        body: {
          name: 'Renovasi Gedung Gereja',
          fundId: f.building,
          targetAmount: 500_000_000,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        },
      });
      expect(campaign.status).toBe(201);
      const id = campaign.json.campaign.id;
      const badRange = await t.request('POST', `${f.base}/campaigns`, {
        token: treasurer.token,
        body: {
          name: 'Salah',
          fundId: f.building,
          targetAmount: 1,
          startDate: '2026-05-01',
          endDate: '2026-04-01',
        },
      });
      expect(badRange.status).toBe(422);

      const pledge = await t.request('POST', `${f.base}/campaigns/${id}/pledges`, {
        token: requester.token,
        body: { personId: s.memberPerson.id, amount: 10_000_000 },
      });
      expect(pledge.status).toBe(201);
      const duplicate = await t.request('POST', `${f.base}/campaigns/${id}/pledges`, {
        token: requester.token,
        body: { personId: s.memberPerson.id, amount: 1 },
      });
      expect(duplicate.status).toBe(409);
      const nameless = await t.request('POST', `${f.base}/campaigns/${id}/pledges`, {
        token: requester.token,
        body: { amount: 1 },
      });
      expect(nameless.status).toBe(422);

      const gift = await t.request('POST', `${f.base}/contributions`, {
        token: requester.token,
        body: {
          personId: s.memberPerson.id,
          kind: 'pledge_payment',
          fundId: f.building,
          accountId: f.bank,
          campaignId: id,
          method: 'transfer',
          amount: 2_500_000,
          receivedAt: '2026-05-10',
        },
      });
      expect(gift.status).toBe(201);
      expect(gift.json.contribution.campaignName).toBe('Renovasi Gedung Gereja');

      const detail = await t.request('GET', `${f.base}/campaigns/${id}`, { token: viewer.token });
      expect(detail.json.campaign).toMatchObject({
        pledgedAmount: 10_000_000,
        receivedAmount: 2_500_000,
        pledgeCount: 1,
      });
      expect(detail.json.pledges[0].paidAmount).toBe(2_500_000);

      const mine = await t.request('GET', `${f.base}/my-giving?year=2026`, {
        token: s.member.token,
      });
      expect(mine.json.statement.pledges[0]).toMatchObject({
        amount: 10_000_000,
        paidAmount: 2_500_000,
      });

      const deleteUsed = await t.request('DELETE', `${f.base}/campaigns/${id}`, {
        token: treasurer.token,
      });
      expect(deleteUsed.status).toBe(409);

      const closed = await t.request('PATCH', `${f.base}/campaigns/${id}`, {
        token: treasurer.token,
        body: {
          name: 'Renovasi Gedung Gereja',
          fundId: f.building,
          targetAmount: 500_000_000,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          status: 'closed',
        },
      });
      expect(closed.status).toBe(200);
      const giftToClosed = await t.request('POST', `${f.base}/contributions`, {
        token: requester.token,
        body: {
          kind: 'donation',
          fundId: f.building,
          accountId: f.bank,
          campaignId: id,
          method: 'transfer',
          amount: 1_000,
          receivedAt: '2026-05-10',
        },
      });
      expect(giftToClosed.status).toBe(400);

      const removed = await t.request(
        'DELETE',
        `${f.base}/campaigns/${id}/pledges/${pledge.json.pledge.id}`,
        {
          token: requester.token,
        },
      );
      expect(removed.status).toBe(200);
      expect(
        (await t.request('GET', `${f.base}/campaigns`, { token: s.member.token })).status,
      ).toBe(403);
      const audit = await financeAudit(t, s, `&entityId=${pledge.json.pledge.id}`);
      expect(audit.map((entry) => entry.action)).toEqual(['pledge.delete', 'pledge.create']);
    });
  });
});
