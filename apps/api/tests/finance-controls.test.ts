import { DEFAULT_TIMEZONE } from '@tatagereja/shared';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { worshipServices } from '../src/db/schema';
import { createRateLimiter } from '../src/lib/rate-limit';
import { nowIso } from '../src/lib/time';
import { newId } from '../src/lib/tokens';
import { todayIn } from '../src/services/finance';
import { createTestApp, seedChurch } from './helpers';
import {
  financeAudit,
  memberWithRole,
  otherChurch,
  setupFinance,
  thisMonthDay,
  type Member,
  type Seed,
} from './finance-helpers';

/*
 * Controls that keep the books trustworthy: segregation of duties across every editor,
 * corrections only by the recorder or a manager, closed months that include opening balances,
 * reversing a payment, and where non-cash offerings land.
 */
describe('finance controls', () => {
  const t = createTestApp(
    {},
    {
      limiters: {
        login: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
        register: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
        invitation: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
        'finance.export': createRateLimiter({ windowMs: 60_000, max: 3 }),
      },
    },
  );
  afterAll(() => t.close());
  let s: Seed;
  let f: Awaited<ReturnType<typeof setupFinance>>;
  let counter: Member;
  let treasurer: Member;
  let recorder: Member;
  let manager: Member;
  let qris = '';

  const offering = (overrides: Record<string, unknown> = {}) => ({
    serviceDate: thisMonthDay(1),
    serviceLabel: 'Ibadah Umum 1',
    accountId: f.cash,
    counter1UserId: counter.user.id,
    counter2Name: 'Ibu Sari',
    lines: [{ fundId: f.general, method: 'cash', amount: 500_000 }],
    ...overrides,
  });

  beforeAll(async () => {
    s = await seedChurch(t);
    f = await setupFinance(t, s);
    counter = await memberWithRole(t, s, 'Counter', ['finance.record']);
    // Records, approves and manages: the person segregation of duties has to stop.
    treasurer = await memberWithRole(t, s, 'Treasurer', [
      'finance.view',
      'finance.record',
      'finance.approve',
      'finance.manage',
    ]);
    recorder = await memberWithRole(t, s, 'Recorder', ['finance.record']);
    manager = await memberWithRole(t, s, 'Manager', ['finance.manage']);
    const created = await t.request('POST', `${f.base}/accounts`, {
      token: s.owner.token,
      body: { name: 'QRIS Gereja', type: 'ewallet', openingDate: '2026-01-01' },
    });
    expect(created.status).toBe(201);
    qris = created.json.account.id;
  });

  it('keeps everyone who ever edited an offering count from verifying it', async () => {
    const created = await t.request('POST', `${f.base}/offerings`, {
      token: counter.token,
      body: offering(),
    });
    expect(created.status).toBe(201);
    const id = created.json.batch.id;
    // The treasurer quietly changes the amount, then the counter edits and submits it.
    const changed = await t.request('PATCH', `${f.base}/offerings/${id}`, {
      token: treasurer.token,
      body: offering({ lines: [{ fundId: f.general, method: 'cash', amount: 400_000 }] }),
    });
    expect(changed.status).toBe(200);
    const resubmitted = await t.request('PATCH', `${f.base}/offerings/${id}`, {
      token: counter.token,
      body: offering({
        notes: 'Dihitung ulang',
        lines: [{ fundId: f.general, method: 'cash', amount: 400_000 }],
        submit: true,
      }),
    });
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.json.batch.updatedBy).toBe(counter.user.id);

    const detail = await t.request('GET', `${f.base}/offerings/${id}`, { token: treasurer.token });
    expect(detail.json.batch.canVerify).toBe(false);
    const pending = await t.request('GET', `${f.base}/pending`, { token: treasurer.token });
    expect(pending.json.batches).toBe(0);
    const verify = await t.request('POST', `${f.base}/offerings/${id}/verify`, {
      token: treasurer.token,
    });
    expect(verify.status).toBe(403);
    expect(verify.json.error.code).toBe('SELF_APPROVAL');

    // Someone who never touched it verifies it.
    const verified = await t.request('POST', `${f.base}/offerings/${id}/verify`, {
      token: s.owner.token,
    });
    expect(verified.status).toBe(200);
  });

  it('posts transfer and QRIS lines to the account they landed in', async () => {
    const created = await t.request('POST', `${f.base}/offerings`, {
      token: counter.token,
      body: offering({
        submit: true,
        lines: [
          { fundId: f.general, method: 'cash', amount: 300_000 },
          { fundId: f.general, method: 'qris', accountId: qris, amount: 125_000 },
        ],
      }),
    });
    expect(created.status).toBe(201);
    expect(created.json.batch.lines[1].accountId).toBe(qris);
    expect(created.json.batch.lines[1].accountName).toBe('QRIS Gereja');
    const verified = await t.request(
      'POST',
      `${f.base}/offerings/${created.json.batch.id}/verify`,
      {
        token: s.owner.token,
      },
    );
    expect(verified.status).toBe(200);
    const entries = await t.request(
      'GET',
      `${f.base}/entries?sourceType=offering&accountId=${qris}`,
      { token: s.owner.token },
    );
    expect(entries.json.items).toHaveLength(1);
    expect(entries.json.items[0].amount).toBe(125_000);

    // Cash lines stay in the cash box, and an account of another church is refused.
    const other = await otherChurch(t);
    const foreign = await t.request('POST', `${f.base}/offerings`, {
      token: counter.token,
      body: offering({
        lines: [
          {
            fundId: f.general,
            method: 'transfer',
            accountId: other.setup.accounts[0]!.id,
            amount: 1_000,
          },
        ],
      }),
    });
    expect(foreign.status).toBe(404);
  });

  it('lists the worship services of a day to link a count to', async () => {
    const serviceId = newId();
    const now = nowIso();
    t.db
      .insert(worshipServices)
      .values({
        id: serviceId,
        churchId: s.church.id,
        title: 'Ibadah Minggu Pagi',
        startsAt: `${thisMonthDay(1)}T01:00:00.000Z`,
        location: 'Gedung Gereja',
        status: 'published',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const list = await t.request('GET', `${f.base}/offerings/services?date=${thisMonthDay(1)}`, {
      token: counter.token,
    });
    expect(list.status).toBe(200);
    expect(list.json.items.map((item: { id: string }) => item.id)).toEqual([serviceId]);
    const none = await t.request('GET', `${f.base}/offerings/services?date=2020-01-05`, {
      token: counter.token,
    });
    expect(none.json.items).toEqual([]);
    const member = await t.request('GET', `${f.base}/offerings/services?date=${thisMonthDay(1)}`, {
      token: s.member.token,
    });
    expect(member.status).toBe(403);

    const linked = await t.request('POST', `${f.base}/offerings`, {
      token: counter.token,
      body: offering({ worshipServiceId: serviceId }),
    });
    expect(linked.status).toBe(201);
    expect(linked.json.batch.worshipServiceId).toBe(serviceId);
  });

  it('keeps a manager who edited a request from approving it', async () => {
    const draft = await t.request('POST', `${f.base}/expenses`, {
      token: counter.token,
      body: {
        title: 'Konsumsi rapat majelis',
        categoryId: f.category('Administrasi'),
        fundId: f.general,
        amount: 250_000,
      },
    });
    expect(draft.status).toBe(201);
    const id = draft.json.expense.id;
    const edited = await t.request('PATCH', `${f.base}/expenses/${id}`, {
      token: treasurer.token,
      body: {
        title: 'Konsumsi rapat majelis',
        categoryId: f.category('Administrasi'),
        fundId: f.general,
        amount: 2_500_000,
        payeeName: 'Toko Sahabat',
      },
    });
    expect(edited.status).toBe(200);
    const submitted = await t.request('POST', `${f.base}/expenses/${id}/submit`, {
      token: counter.token,
    });
    expect(submitted.status).toBe(200);
    expect(submitted.json.expense.status).toBe('submitted');

    const detail = await t.request('GET', `${f.base}/expenses/${id}`, { token: treasurer.token });
    expect(detail.json.expense.canApprove).toBe(false);
    const decide = await t.request('POST', `${f.base}/expenses/${id}/decide`, {
      token: treasurer.token,
      body: { decision: 'approved' },
    });
    expect(decide.status).toBe(403);
    expect(decide.json.error.code).toBe('SELF_APPROVAL');
    const approved = await t.request('POST', `${f.base}/expenses/${id}/decide`, {
      token: s.owner.token,
      body: { decision: 'approved' },
    });
    expect(approved.status).toBe(200);
  });

  it('reverses a payment recorded by mistake, only in an open month', async () => {
    const created = await t.request('POST', `${f.base}/expenses`, {
      token: counter.token,
      body: {
        title: 'Tagihan listrik',
        categoryId: f.category('Listrik, Air & Internet'),
        fundId: f.general,
        amount: 180_000,
        submit: true,
      },
    });
    const id = created.json.expense.id;
    await t.request('POST', `${f.base}/expenses/${id}/decide`, {
      token: s.owner.token,
      body: { decision: 'approved' },
    });
    const balanceOf = async () =>
      (await t.request('GET', `${f.base}/setup`, { token: s.owner.token })).json.accounts.find(
        (account: { id: string }) => account.id === f.bank,
      ).balance as number;
    const before = await balanceOf();
    const paid = await t.request('POST', `${f.base}/expenses/${id}/pay`, {
      token: counter.token,
      body: { accountId: f.bank, paidAt: thisMonthDay(1) },
    });
    expect(paid.status).toBe(200);
    expect(await balanceOf()).toBe(before - 180_000);

    const byRecorder = await t.request('POST', `${f.base}/expenses/${id}/reverse-payment`, {
      token: counter.token,
      body: { reason: 'Salah rekening' },
    });
    expect(byRecorder.status).toBe(403);
    const reversed = await t.request('POST', `${f.base}/expenses/${id}/reverse-payment`, {
      token: manager.token,
      body: { reason: 'Salah rekening' },
    });
    expect(reversed.status).toBe(200);
    expect(reversed.json.expense.status).toBe('approved');
    expect(reversed.json.expense.paidAt).toBeNull();
    expect(reversed.json.expense.paidFromAccountId).toBeNull();
    expect(await balanceOf()).toBe(before);
    const audit = await financeAudit(t, s, '&action=expense.reverse_payment');
    expect(audit[0]?.entityId).toBe(id);
    expect(audit[0]?.before).toMatchObject({ status: 'paid', accountId: f.bank });

    // Paid again into a month that is then closed: the payment stays.
    await t.request('POST', `${f.base}/expenses/${id}/pay`, {
      token: counter.token,
      body: { accountId: f.cash, paidAt: '2026-02-10' },
    });
    const close = await t.request('POST', `${f.base}/periods/2026/2/close`, {
      token: s.owner.token,
    });
    expect(close.status).toBe(200);
    const locked = await t.request('POST', `${f.base}/expenses/${id}/reverse-payment`, {
      token: manager.token,
      body: { reason: 'Salah rekening' },
    });
    expect(locked.status).toBe(409);
    expect(locked.json.error.code).toBe('PERIOD_CLOSED');
  });

  it('lets only the recorder or a manager correct a gift, and the recorder print it', async () => {
    const created = await t.request('POST', `${f.base}/contributions`, {
      token: recorder.token,
      body: {
        personId: s.alice.id,
        kind: 'tithe',
        fundId: f.general,
        accountId: f.cash,
        method: 'cash',
        amount: 1_000_000,
        receivedAt: thisMonthDay(1),
      },
    });
    expect(created.status).toBe(201);
    const id = created.json.contribution.id;
    expect(created.json.contribution.recordedBy).toBe(recorder.user.id);
    const body = {
      personId: s.alice.id,
      kind: 'tithe',
      fundId: f.general,
      accountId: f.cash,
      method: 'cash',
      amount: 100_000,
      receivedAt: thisMonthDay(1),
    };

    // The person who recorded it (finance.record only) can open the receipt.
    const receipt = await t.request('GET', `${f.base}/contributions/${id}`, {
      token: recorder.token,
    });
    expect(receipt.status).toBe(200);
    const notTheirs = await t.request('GET', `${f.base}/contributions/${id}`, {
      token: counter.token,
    });
    expect(notTheirs.status).toBe(404);

    const byOther = await t.request('PATCH', `${f.base}/contributions/${id}`, {
      token: counter.token,
      body,
    });
    expect(byOther.status).toBe(403);
    const byRecorder = await t.request('PATCH', `${f.base}/contributions/${id}`, {
      token: recorder.token,
      body: { ...body, amount: 900_000 },
    });
    expect(byRecorder.status).toBe(200);
    const byManager = await t.request('PATCH', `${f.base}/contributions/${id}`, {
      token: manager.token,
      body: { ...body, amount: 950_000 },
    });
    expect(byManager.status).toBe(200);
    expect(byManager.json.contribution.amount).toBe(950_000);
  });

  it('corrects a gift of a campaign that has since closed', async () => {
    const campaign = await t.request('POST', `${f.base}/campaigns`, {
      token: s.owner.token,
      body: {
        name: 'Renovasi Pastori',
        fundId: f.building,
        targetAmount: 10_000_000,
        startDate: '2026-01-01',
      },
    });
    const campaignId = campaign.json.campaign.id;
    const body = {
      personId: s.bob.id,
      kind: 'pledge_payment',
      fundId: f.building,
      accountId: f.bank,
      campaignId,
      method: 'transfer',
      amount: 500_000,
      receivedAt: thisMonthDay(1),
    };
    const gift = await t.request('POST', `${f.base}/contributions`, {
      token: s.owner.token,
      body,
    });
    expect(gift.status).toBe(201);
    await t.request('PATCH', `${f.base}/campaigns/${campaignId}`, {
      token: s.owner.token,
      body: {
        name: 'Renovasi Pastori',
        fundId: f.building,
        targetAmount: 10_000_000,
        startDate: '2026-01-01',
        status: 'closed',
      },
    });
    const corrected = await t.request(
      'PATCH',
      `${f.base}/contributions/${gift.json.contribution.id}`,
      {
        token: s.owner.token,
        body: { ...body, reference: 'TRF 0042' },
      },
    );
    expect(corrected.status).toBe(200);
    // A new gift still cannot go to the closed campaign.
    const fresh = await t.request('POST', `${f.base}/contributions`, {
      token: s.owner.token,
      body,
    });
    expect(fresh.status).toBe(400);
  });

  it('locks opening balances once a month after them is closed', async () => {
    // February 2026 was closed above; the bank account opened on 2026-01-01.
    const account = (
      await t.request('GET', `${f.base}/setup`, { token: s.owner.token })
    ).json.accounts.find((item: { id: string }) => item.id === f.bank);
    const patch = await t.request('PATCH', `${f.base}/accounts/${f.bank}`, {
      token: s.owner.token,
      body: {
        name: account.name,
        type: account.type,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        openingBalance: account.openingBalance + 1,
        openingDate: account.openingDate,
      },
    });
    expect(patch.status).toBe(409);
    expect(patch.json.error.code).toBe('PERIOD_CLOSED');
    // Renaming it is still fine.
    const rename = await t.request('PATCH', `${f.base}/accounts/${f.bank}`, {
      token: s.owner.token,
      body: { ...account, name: 'BCA Jemaat', balance: undefined, id: undefined },
    });
    expect(rename.status).toBe(200);
  });

  it('hides opening balances from people who only record', async () => {
    const setup = await t.request('GET', `${f.base}/setup`, { token: counter.token });
    expect(setup.status).toBe(200);
    for (const account of setup.json.accounts) {
      expect(account.balance).toBeNull();
      expect(account.openingBalance).toBeNull();
    }
    const managed = await t.request('GET', `${f.base}/setup`, { token: manager.token });
    expect(managed.json.accounts[0].openingBalance).not.toBeNull();
    expect(managed.json.accounts[0].balance).toBeNull();
  });

  it('refuses to turn a category used by gifts into an expense category', async () => {
    const tithe = f.category('Perpuluhan');
    const patch = await t.request('PATCH', `${f.base}/categories/${tithe}`, {
      token: s.owner.token,
      body: { kind: 'expense', name: 'Perpuluhan' },
    });
    expect(patch.status).toBe(409);
  });

  it('leaves months that have not started out of the monthly report', async () => {
    const year = Number(todayIn(DEFAULT_TIMEZONE).slice(0, 4));
    const report = await t.request(
      'GET',
      `${f.base}/reports/income_expense?from=${year}-01-01&to=${year}-12-31`,
      { token: s.owner.token },
    );
    expect(report.status).toBe(200);
    const keys = report.json.rows.map((row: { key: string }) => row.key);
    expect(keys[0]).toBe(`${year}-01`);
    expect(keys.at(-1)).toBe(todayIn(DEFAULT_TIMEZONE).slice(0, 7));
    const future = await t.request(
      'GET',
      `${f.base}/reports/income_expense?from=${year + 1}-01-01&to=${year + 1}-03-31`,
      { token: s.owner.token },
    );
    expect(future.json.rows).toEqual([]);
  });

  it('rate-limits CSV exports', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const response = await t.request('GET', `${f.base}/entries?format=csv`, {
        token: s.owner.token,
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
