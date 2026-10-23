import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp, seedChurch } from './helpers';
import {
  financeAudit,
  memberWithRole,
  notificationsOf,
  setupFinance,
  type Member,
  type Seed,
} from './finance-helpers';

describe('finance periods and reports', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Seed;
  let f: Awaited<ReturnType<typeof setupFinance>>;
  let manager: Member;
  let manager2: Member;
  let recorder: Member;
  let reporter: Member;
  let verifier: Member;
  let contributionId = '';

  const gift = (receivedAt: string, amount: number, extra: Record<string, unknown> = {}) =>
    t.request('POST', `${f.base}/contributions`, {
      token: recorder.token,
      body: {
        personId: s.memberPerson.id,
        kind: 'tithe',
        fundId: f.general,
        accountId: f.bank,
        method: 'transfer',
        amount,
        receivedAt,
        ...extra,
      },
    });

  beforeAll(async () => {
    s = await seedChurch(t);
    f = await setupFinance(t, s);
    manager = await memberWithRole(t, s, 'Manager', ['finance.manage', 'finance.view']);
    manager2 = await memberWithRole(t, s, 'Manager Two', ['finance.manage']);
    recorder = await memberWithRole(t, s, 'Recorder', ['finance.record']);
    reporter = await memberWithRole(t, s, 'Reporter', ['finance.reports']);
    verifier = await memberWithRole(t, s, 'Verifier', ['finance.approve']);

    contributionId = (await gift('2026-01-11', 1_000_000)).json.contribution.id;
    await gift('2026-02-08', 2_000_000, { fundId: f.building });
    await gift('2026-02-15', 500_000, { kind: 'thanksgiving', accountId: f.cash, method: 'cash' });
    await t.request('POST', `${f.base}/adjustments`, {
      token: manager.token,
      body: {
        entryDate: '2026-02-20',
        accountId: f.cash,
        fundId: f.general,
        categoryId: f.category('Listrik, Air & Internet'),
        amount: -350_000,
        description: 'Listrik Februari',
      },
    });
    await t.request('POST', `${f.base}/transfers`, {
      token: manager.token,
      body: {
        fromAccountId: f.cash,
        toAccountId: f.bank,
        fundId: f.general,
        amount: 100_000,
        transferDate: '2026-02-21',
      },
    });
  });

  describe('closing periods', () => {
    it('blocks closing while offering counts are pending and closes otherwise', async () => {
      const pending = await t.request('POST', `${f.base}/offerings`, {
        token: recorder.token,
        body: {
          serviceDate: '2026-01-04',
          accountId: f.cash,
          counter1Name: 'Pak Tobing',
          counter2Name: 'Bu Ruth',
          lines: [{ fundId: f.general, amount: 300_000 }],
          submit: true,
        },
      });
      expect(pending.status).toBe(201);
      const blocked = await t.request('POST', `${f.base}/periods/2026/1/close`, {
        token: manager.token,
      });
      expect(blocked.status).toBe(409);
      expect(blocked.json.error.message).toContain('offering count');

      await t.request('POST', `${f.base}/offerings/${pending.json.batch.id}/verify`, {
        token: verifier.token,
      });
      const denied = await t.request('POST', `${f.base}/periods/2026/1/close`, {
        token: recorder.token,
      });
      expect(denied.status).toBe(403);
      const closed = await t.request('POST', `${f.base}/periods/2026/1/close`, {
        token: manager.token,
      });
      expect(closed.status).toBe(200);
      expect(closed.json.period).toMatchObject({
        status: 'closed',
        income: 1_300_000,
        closedByName: 'Manager',
      });
      const twice = await t.request('POST', `${f.base}/periods/2026/1/close`, {
        token: manager.token,
      });
      expect(twice.status).toBe(409);
      const future = await t.request('POST', `${f.base}/periods/2999/1/close`, {
        token: manager.token,
      });
      expect(future.status).toBe(400);
      const invalid = await t.request('POST', `${f.base}/periods/2026/13/close`, {
        token: manager.token,
      });
      expect(invalid.status).toBe(422);
    });

    it('makes entries of a closed month immutable', async () => {
      const newGift = await gift('2026-01-20', 1_000);
      expect(newGift.status).toBe(409);
      expect(newGift.json.error.code).toBe('PERIOD_CLOSED');
      expect(newGift.json.error.message).toContain('January 2026');

      const correction = await t.request('PATCH', `${f.base}/contributions/${contributionId}`, {
        token: recorder.token,
        body: {
          personId: s.memberPerson.id,
          kind: 'tithe',
          fundId: f.general,
          accountId: f.bank,
          method: 'transfer',
          amount: 2,
          receivedAt: '2026-01-11',
        },
      });
      expect(correction.json.error.code).toBe('PERIOD_CLOSED');
      // Moving a gift out of a closed month is refused too.
      const moved = await t.request('PATCH', `${f.base}/contributions/${contributionId}`, {
        token: recorder.token,
        body: {
          personId: s.memberPerson.id,
          kind: 'tithe',
          fundId: f.general,
          accountId: f.bank,
          method: 'transfer',
          amount: 1_000_000,
          receivedAt: '2026-03-01',
        },
      });
      expect(moved.json.error.code).toBe('PERIOD_CLOSED');
      const voided = await t.request('POST', `${f.base}/contributions/${contributionId}/void`, {
        token: s.owner.token,
        body: { reason: 'Coba' },
      });
      expect(voided.status).toBe(409);
      const adjustment = await t.request('POST', `${f.base}/adjustments`, {
        token: manager.token,
        body: {
          entryDate: '2026-01-31',
          accountId: f.cash,
          fundId: f.general,
          amount: 1,
          description: 'Late',
        },
      });
      expect(adjustment.json.error.code).toBe('PERIOD_CLOSED');
      const opening = await t.request('PATCH', `${f.base}/accounts/${f.cash}`, {
        token: s.owner.token,
        body: { name: 'Kas Tunai', type: 'cash', openingBalance: 9, openingDate: '2026-01-01' },
      });
      expect(opening.json.error.code).toBe('PERIOD_CLOSED');
      const rename = await t.request('PATCH', `${f.base}/accounts/${f.cash}`, {
        token: s.owner.token,
        body: {
          name: 'Kas Tunai Gereja',
          type: 'cash',
          openingBalance: 1_000_000,
          openingDate: '2026-01-01',
        },
      });
      expect(rename.status).toBe(200);
    });

    it('reopens with a reason, audited and announced to other managers', async () => {
      const noReason = await t.request('POST', `${f.base}/periods/2026/1/reopen`, {
        token: manager.token,
        body: {},
      });
      expect(noReason.status).toBe(422);
      const reopened = await t.request('POST', `${f.base}/periods/2026/1/reopen`, {
        token: manager.token,
        body: { reason: 'Koreksi transfer perpuluhan' },
      });
      expect(reopened.status).toBe(200);
      expect(reopened.json.period.status).toBe('reopened');
      expect(reopened.json.period.reopenReason).toBe('Koreksi transfer perpuluhan');
      expect((await gift('2026-01-20', 1_000)).status).toBe(201);
      const notices = await notificationsOf(t, manager2.token);
      expect(notices.some((notice) => notice.type === 'finance.period_reopened')).toBe(true);
      const audit = await financeAudit(t, s, '&entityType=finance_period');
      expect(audit.map((entry) => entry.action)).toEqual([
        'finance.period_reopen',
        'finance.period_close',
      ]);
      const notClosed = await t.request('POST', `${f.base}/periods/2026/1/reopen`, {
        token: manager.token,
        body: { reason: 'Lagi' },
      });
      expect(notClosed.status).toBe(409);

      const list = await t.request('GET', `${f.base}/periods?year=2026`, { token: manager.token });
      expect(list.json.items).toHaveLength(12);
      expect(list.json.items[0].status).toBe('reopened');
      expect(list.json.items[1]).toMatchObject({
        status: 'open',
        income: 2_500_000,
        expense: 350_000,
      });
    });
  });

  describe('reports', () => {
    const range = 'from=2026-01-01&to=2026-03-31';

    it('requires finance.reports', async () => {
      for (const token of [manager.token, recorder.token, s.member.token]) {
        expect(
          (await t.request('GET', `${f.base}/reports/income_expense?${range}`, { token })).status,
        ).toBe(403);
      }
      const unknown = await t.request('GET', `${f.base}/reports/everything?${range}`, {
        token: reporter.token,
      });
      expect(unknown.status).toBe(422);
      const reversed = await t.request(
        'GET',
        `${f.base}/reports/income_expense?from=2026-03-01&to=2026-01-01`,
        { token: reporter.token },
      );
      expect(reversed.status).toBe(422);
      const tooLong = await t.request(
        'GET',
        `${f.base}/reports/income_expense?from=2020-01-01&to=2026-01-01`,
        { token: reporter.token },
      );
      expect(tooLong.status).toBe(422);
    });

    it('reports income vs expense per month, leaving transfers out', async () => {
      const report = await t.request('GET', `${f.base}/reports/income_expense?${range}`, {
        token: reporter.token,
      });
      expect(report.status).toBe(200);
      expect(report.json.rows.map((row: { key: string }) => row.key)).toEqual([
        '2026-01',
        '2026-02',
        '2026-03',
      ]);
      expect(report.json.rows[0]).toMatchObject({ income: 1_301_000, expense: 0 });
      expect(report.json.rows[1]).toMatchObject({
        income: 2_500_000,
        expense: 350_000,
        net: 2_150_000,
      });
      expect(report.json.totals).toEqual({ income: 3_801_000, expense: 350_000, net: 3_451_000 });
    });

    it('reports by fund, by category, weekly trend and cash flow', async () => {
      const byFund = await t.request('GET', `${f.base}/reports/by_fund?${range}`, {
        token: reporter.token,
      });
      const building = byFund.json.rows.find(
        (row: { label: string }) => row.label === 'Pembangunan',
      );
      expect(building.income).toBe(2_000_000);

      const byCategory = await t.request('GET', `${f.base}/reports/by_category?${range}`, {
        token: reporter.token,
      });
      const labels = byCategory.json.rows.map((row: { label: string }) => row.label);
      expect(labels).toContain('Perpuluhan');
      expect(labels).toContain('Persembahan Syukur');
      expect(labels).toContain('Listrik, Air & Internet');
      expect(
        byCategory.json.rows.find((row: { key: string }) => row.key === 'uncategorized')?.income,
      ).toBe(300_000);

      const trend = await t.request(
        'GET',
        `${f.base}/reports/trend?from=2026-02-01&to=2026-02-28`,
        {
          token: reporter.token,
        },
      );
      expect(trend.json.rows[0].key).toBe('2026-02-01');
      expect(trend.json.rows.find((row: { key: string }) => row.key === '2026-02-08').income).toBe(
        2_000_000,
      );

      const flow = await t.request(
        'GET',
        `${f.base}/reports/cash_flow?from=2026-02-01&to=2026-02-28`,
        {
          token: reporter.token,
        },
      );
      const cash = flow.json.rows.find((row: { key: string }) => row.key === f.cash);
      // Opening 1.000.000 + January offering 300.000; February: +500.000 −350.000 −100.000.
      expect(cash).toMatchObject({
        opening: 1_300_000,
        income: 500_000,
        expense: 450_000,
        closing: 1_350_000,
      });
      const bank = flow.json.rows.find((row: { key: string }) => row.key === f.bank);
      expect(bank.income).toBe(2_100_000);

      const byAccount = await t.request(
        'GET',
        `${f.base}/reports/by_fund?${range}&accountId=${f.cash}`,
        { token: reporter.token },
      );
      expect(byAccount.json.totals.income).toBe(800_000);
    });

    it('exports CSV', async () => {
      const response = await t.app.handle(
        new Request(`http://localhost${f.base}/reports/cash_flow?${range}&format=csv`, {
          headers: { authorization: `Bearer ${reporter.token}` },
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toContain('laporan-cash-flow');
      const text = await response.text();
      expect(text).toContain('Uraian,Saldo awal,Penerimaan,Pengeluaran,Selisih,Saldo akhir');
      expect(text).toContain('Total');
    });
  });
});
