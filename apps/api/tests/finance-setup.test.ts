import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp, seedChurch } from './helpers';
import {
  financeAudit,
  memberWithRole,
  otherChurch,
  setupFinance,
  today,
  type Member,
  type Seed,
} from './finance-helpers';

describe('finance setup, ledger and transfers', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Seed;
  let f: Awaited<ReturnType<typeof setupFinance>>;
  let viewer: Member;
  let recorder: Member;
  let manager: Member;
  let outsider: Member;

  beforeAll(async () => {
    s = await seedChurch(t);
    f = await setupFinance(t, s);
    viewer = await memberWithRole(t, s, 'Viewer', ['finance.view']);
    recorder = await memberWithRole(t, s, 'Recorder', ['finance.record']);
    manager = await memberWithRole(t, s, 'Manager', ['finance.manage']);
    outsider = await t.register('Outsider');
  });

  describe('suggested setup', () => {
    it('creates the suggested funds, categories and a cash box once', async () => {
      expect(f.setup.funds.map((fund) => fund.name)).toEqual([
        'Kas Umum',
        'Pembangunan',
        'Misi',
        'Diakonia',
      ]);
      expect(f.setup.categories.filter((c) => c.kind === 'income')).toHaveLength(5);
      expect(f.setup.categories.filter((c) => c.kind === 'expense')).toHaveLength(8);
      const cash = f.setup.accounts.find((account) => account.name === 'Kas Tunai');
      expect(cash?.balance).toBe(1_000_000);
      const again = await t.request('POST', `${f.base}/setup/defaults`, {
        token: s.owner.token,
        body: { openingDate: '2026-01-01' },
      });
      expect(again.status).toBe(200);
      expect(again.json.created).toEqual({ funds: [], categories: [], cash: false });
      expect(again.json.funds).toHaveLength(4);
    });

    it('only lets finance managers run the suggested setup', async () => {
      for (const token of [s.member.token, viewer.token, recorder.token, s.leader.token]) {
        const denied = await t.request('POST', `${f.base}/setup/defaults`, {
          token,
          body: { openingDate: '2026-01-01' },
        });
        expect(denied.status).toBe(403);
      }
      const allowed = await t.request('POST', `${f.base}/setup/defaults`, {
        token: manager.token,
        body: { openingDate: '2026-01-01' },
      });
      expect(allowed.status).toBe(200);
    });

    it('shows balances only to finance viewers', async () => {
      const asViewer = await t.request('GET', `${f.base}/setup`, { token: viewer.token });
      expect(asViewer.status).toBe(200);
      expect(asViewer.json.accounts[0].balance).not.toBeNull();
      const asRecorder = await t.request('GET', `${f.base}/setup`, { token: recorder.token });
      expect(asRecorder.status).toBe(200);
      expect(asRecorder.json.accounts.every((a: { balance: null }) => a.balance === null)).toBe(
        true,
      );
      expect(asRecorder.json.funds.every((a: { balance: null }) => a.balance === null)).toBe(true);
      for (const token of [s.member.token, s.leader.token]) {
        expect((await t.request('GET', `${f.base}/setup`, { token })).status).toBe(403);
      }
      expect((await t.request('GET', `${f.base}/setup`, { token: outsider.token })).status).toBe(
        403,
      );
      expect((await t.request('GET', `${f.base}/setup`)).status).toBe(401);
    });
  });

  describe('funds, accounts and categories', () => {
    it('creates, renames and deactivates funds with audit entries', async () => {
      const created = await t.request('POST', `${f.base}/funds`, {
        token: manager.token,
        body: { name: 'Beasiswa', isRestricted: true, description: 'Beasiswa anak jemaat' },
      });
      expect(created.status).toBe(201);
      expect(created.json.fund.isRestricted).toBe(true);
      expect(created.json.fund.balance).toBeNull();

      const duplicate = await t.request('POST', `${f.base}/funds`, {
        token: s.owner.token,
        body: { name: 'beasiswa' },
      });
      expect(duplicate.status).toBe(409);

      const invalid = await t.request('POST', `${f.base}/funds`, {
        token: s.owner.token,
        body: { name: 'B' },
      });
      expect(invalid.status).toBe(422);
      expect(invalid.json.error.issues[0].path).toBe('name');

      const updated = await t.request('PATCH', `${f.base}/funds/${created.json.fund.id}`, {
        token: s.admin.token,
        body: {
          name: 'Beasiswa Pendidikan',
          description: 'Beasiswa anak jemaat',
          isRestricted: true,
          isActive: false,
        },
      });
      expect(updated.status).toBe(200);
      expect(updated.json.fund.isActive).toBe(false);
      expect(updated.json.fund.balance).toBe(0);

      const audit = await financeAudit(t, s, `&entityId=${created.json.fund.id}`);
      expect(audit.map((entry) => entry.action)).toEqual(['fund.update', 'fund.create']);
      expect(audit[0]?.before).toEqual({ name: 'Beasiswa', isActive: true });
      expect(audit[0]?.after).toEqual({ name: 'Beasiswa Pendidikan', isActive: false });

      const removed = await t.request('DELETE', `${f.base}/funds/${created.json.fund.id}`, {
        token: s.owner.token,
      });
      expect(removed.status).toBe(200);
    });

    it('refuses fund and account changes from people without finance.manage', async () => {
      for (const token of [viewer.token, recorder.token, s.member.token]) {
        expect(
          (await t.request('POST', `${f.base}/funds`, { token, body: { name: 'Nope' } })).status,
        ).toBe(403);
        expect(
          (
            await t.request('PATCH', `${f.base}/accounts/${f.cash}`, {
              token,
              body: { name: 'Nope', type: 'cash', openingDate: '2026-01-01' },
            })
          ).status,
        ).toBe(403);
      }
    });

    it('keeps categories of one kind unique and refuses changing the kind once used', async () => {
      const created = await t.request('POST', `${f.base}/categories`, {
        token: s.owner.token,
        body: { kind: 'expense', name: 'Konsumsi' },
      });
      expect(created.status).toBe(201);
      const sameNameOtherKind = await t.request('POST', `${f.base}/categories`, {
        token: s.owner.token,
        body: { kind: 'income', name: 'Konsumsi' },
      });
      expect(sameNameOtherKind.status).toBe(201);
      const duplicate = await t.request('POST', `${f.base}/categories`, {
        token: s.owner.token,
        body: { kind: 'expense', name: 'KONSUMSI' },
      });
      expect(duplicate.status).toBe(409);

      const used = await t.request('PATCH', `${f.base}/categories/${f.category('Perpuluhan')}`, {
        token: s.owner.token,
        body: { kind: 'income', name: 'Perpuluhan', code: '4.2' },
      });
      expect(used.status).toBe(200);
      expect(used.json.category.code).toBe('4.2');
    });

    it('refuses deleting accounts that have entries', async () => {
      const adjustment = await t.request('POST', `${f.base}/adjustments`, {
        token: s.owner.token,
        body: {
          entryDate: '2026-02-03',
          accountId: f.cash,
          fundId: f.general,
          amount: -25_000,
          description: 'Selisih kas kecil',
        },
      });
      expect(adjustment.status).toBe(201);
      const denied = await t.request('DELETE', `${f.base}/accounts/${f.cash}`, {
        token: s.owner.token,
      });
      expect(denied.status).toBe(409);
      expect(denied.json.error.message).toContain('Deactivate');
      const fund = await t.request('DELETE', `${f.base}/funds/${f.general}`, {
        token: s.owner.token,
      });
      expect(fund.status).toBe(409);
    });
  });

  describe('ledger', () => {
    it('posts adjustments, computes running balances and voids them', async () => {
      const deposit = await t.request('POST', `${f.base}/adjustments`, {
        token: manager.token,
        body: {
          entryDate: '2026-02-10',
          accountId: f.cash,
          fundId: f.general,
          amount: 125_000,
          description: 'Koreksi setoran',
        },
      });
      expect(deposit.status).toBe(201);
      expect(deposit.json.entry.sourceType).toBe('adjustment');

      const zero = await t.request('POST', `${f.base}/adjustments`, {
        token: manager.token,
        body: {
          entryDate: '2026-02-10',
          accountId: f.cash,
          fundId: f.general,
          amount: 0,
          description: 'Nol',
        },
      });
      expect(zero.status).toBe(422);

      const asRecorder = await t.request('POST', `${f.base}/adjustments`, {
        token: recorder.token,
        body: {
          entryDate: '2026-02-10',
          accountId: f.cash,
          fundId: f.general,
          amount: 1,
          description: 'Nope',
        },
      });
      expect(asRecorder.status).toBe(403);

      const list = await t.request('GET', `${f.base}/entries?accountId=${f.cash}`, {
        token: viewer.token,
      });
      expect(list.status).toBe(200);
      expect(list.json.items.map((entry: { amount: number }) => entry.amount)).toEqual([
        125_000, -25_000,
      ]);
      expect(
        list.json.items.map((entry: { runningBalance: number }) => entry.runningBalance),
      ).toEqual([1_100_000, 975_000]);

      const voided = await t.request('POST', `${f.base}/entries/${deposit.json.entry.id}/void`, {
        token: manager.token,
        body: { reason: 'Salah input' },
      });
      expect(voided.status).toBe(200);
      expect(voided.json.entry.voidedAt).not.toBeNull();
      const again = await t.request('POST', `${f.base}/entries/${deposit.json.entry.id}/void`, {
        token: manager.token,
        body: { reason: 'Salah input' },
      });
      expect(again.status).toBe(409);

      const live = await t.request('GET', `${f.base}/entries?accountId=${f.cash}`, {
        token: viewer.token,
      });
      expect(live.json.total).toBe(1);
      const withVoided = await t.request(
        'GET',
        `${f.base}/entries?accountId=${f.cash}&includeVoided=true`,
        { token: viewer.token },
      );
      expect(withVoided.json.total).toBe(2);

      const audit = await financeAudit(t, s, `&entityId=${deposit.json.entry.id}`);
      expect(audit.map((entry) => entry.action)).toEqual(['entry.void', 'entry.adjust']);
    });

    it('filters entries and exports CSV safely', async () => {
      const out = await t.request('GET', `${f.base}/entries?direction=out`, {
        token: viewer.token,
      });
      expect(out.json.items.every((entry: { amount: number }) => entry.amount < 0)).toBe(true);
      const search = await t.request('GET', `${f.base}/entries?q=kas%20kecil`, {
        token: viewer.token,
      });
      expect(search.json.total).toBe(1);

      await t.request('POST', `${f.base}/adjustments`, {
        token: s.owner.token,
        body: {
          entryDate: '2026-02-11',
          accountId: f.cash,
          fundId: f.general,
          amount: 1_000,
          description: '=HYPERLINK("http://evil")',
        },
      });
      const response = await t.app.handle(
        new Request(`http://localhost${f.base}/entries?format=csv`, {
          headers: { authorization: `Bearer ${viewer.token}` },
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
      const text = await response.text();
      expect(text).toContain('Tanggal,Keterangan');
      expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`);

      expect((await t.request('GET', `${f.base}/entries`, { token: recorder.token })).status).toBe(
        403,
      );
      expect((await t.request('GET', `${f.base}/entries`, { token: s.member.token })).status).toBe(
        403,
      );
    });

    it('summarises balances, the month and recent entries', async () => {
      await t.request('POST', `${f.base}/adjustments`, {
        token: s.owner.token,
        body: {
          entryDate: today(),
          accountId: f.bank,
          fundId: f.general,
          amount: 300_000,
          description: 'Bunga bank',
        },
      });
      const summary = await t.request('GET', `${f.base}/summary`, { token: viewer.token });
      expect(summary.status).toBe(200);
      expect(summary.json.currency).toBe('IDR');
      expect(summary.json.monthIncome).toBe(300_000);
      expect(summary.json.trend).toHaveLength(6);
      expect(summary.json.totalBalance).toBe(
        summary.json.accounts.reduce((sum: number, a: { balance: number }) => sum + a.balance, 0),
      );
      expect(summary.json.recentEntries[0].description).toBe('Bunga bank');
      expect((await t.request('GET', `${f.base}/summary`, { token: recorder.token })).status).toBe(
        403,
      );
    });
  });

  describe('transfers', () => {
    it('moves money between accounts with two entries and voids both', async () => {
      const before = await t.request('GET', `${f.base}/setup`, { token: viewer.token });
      const balanceOf = (setup: typeof before, id: string) =>
        setup.json.accounts.find((a: { id: string }) => a.id === id).balance as number;

      const same = await t.request('POST', `${f.base}/transfers`, {
        token: manager.token,
        body: {
          fromAccountId: f.cash,
          toAccountId: f.cash,
          fundId: f.general,
          amount: 100,
          transferDate: '2026-03-01',
        },
      });
      expect(same.status).toBe(422);
      expect(same.json.error.issues[0].path).toBe('toAccountId');

      const transfer = await t.request('POST', `${f.base}/transfers`, {
        token: manager.token,
        body: {
          fromAccountId: f.cash,
          toAccountId: f.bank,
          fundId: f.general,
          amount: 400_000,
          transferDate: '2026-03-01',
          note: 'Setor kolekte ke bank',
        },
      });
      expect(transfer.status).toBe(201);
      const after = await t.request('GET', `${f.base}/setup`, { token: viewer.token });
      expect(balanceOf(after, f.cash)).toBe(balanceOf(before, f.cash) - 400_000);
      expect(balanceOf(after, f.bank)).toBe(balanceOf(before, f.bank) + 400_000);

      const list = await t.request('GET', `${f.base}/transfers`, { token: viewer.token });
      expect(list.json.items[0].fromAccountName).toBe('Kas Tunai');

      const voided = await t.request(
        'POST',
        `${f.base}/transfers/${transfer.json.transfer.id}/void`,
        { token: manager.token, body: { reason: 'Batal setor' } },
      );
      expect(voided.status).toBe(200);
      const restored = await t.request('GET', `${f.base}/setup`, { token: viewer.token });
      expect(balanceOf(restored, f.cash)).toBe(balanceOf(before, f.cash));

      const denied = await t.request('POST', `${f.base}/transfers`, {
        token: recorder.token,
        body: {
          fromAccountId: f.cash,
          toAccountId: f.bank,
          fundId: f.general,
          amount: 1,
          transferDate: '2026-03-01',
        },
      });
      expect(denied.status).toBe(403);
    });
  });

  describe('isolation', () => {
    it('answers 404 for another church’s funds, accounts and entries', async () => {
      const other = await otherChurch(t);
      const otherFund = other.setup.funds[0]!.id;
      const otherAccount = other.setup.accounts[0]!.id;
      // Using the other church's ids inside this church.
      const patch = await t.request('PATCH', `${f.base}/funds/${otherFund}`, {
        token: s.owner.token,
        body: { name: 'Hijacked' },
      });
      expect(patch.status).toBe(404);
      const adjustment = await t.request('POST', `${f.base}/adjustments`, {
        token: s.owner.token,
        body: {
          entryDate: '2026-03-02',
          accountId: otherAccount,
          fundId: f.general,
          amount: 1,
          description: 'Cross church',
        },
      });
      expect(adjustment.status).toBe(404);
      const transfer = await t.request('POST', `${f.base}/transfers`, {
        token: s.owner.token,
        body: {
          fromAccountId: f.cash,
          toAccountId: otherAccount,
          fundId: f.general,
          amount: 1,
          transferDate: '2026-03-02',
        },
      });
      expect(transfer.status).toBe(404);
      // And the other church's API refuses this church's owner entirely.
      expect((await t.request('GET', `${other.base}/setup`, { token: s.owner.token })).status).toBe(
        403,
      );
    });

    it('answers MODULE_DISABLED once the church switches finance off', async () => {
      const off = await t.request('PATCH', `/api/churches/${s.church.id}/modules`, {
        token: s.owner.token,
        body: { modules: { finance: false } },
      });
      expect(off.status).toBe(200);
      for (const path of ['/setup', '/summary', '/entries', '/my-giving?year=2026']) {
        const response = await t.request('GET', `${f.base}${path}`, { token: s.owner.token });
        expect(response.status).toBe(403);
        expect(response.json.error.code).toBe('MODULE_DISABLED');
      }
      await t.request('PATCH', `/api/churches/${s.church.id}/modules`, {
        token: s.owner.token,
        body: { modules: { finance: true } },
      });
      expect((await t.request('GET', `${f.base}/setup`, { token: s.owner.token })).status).toBe(
        200,
      );
    });
  });
});
