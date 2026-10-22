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

describe('finance income: offerings and contributions', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Seed;
  let f: Awaited<ReturnType<typeof setupFinance>>;
  let counter: Member;
  let counter2: Member;
  let verifier: Member;
  let viewer: Member;
  let manager: Member;

  const offering = (overrides: Record<string, unknown> = {}) => ({
    serviceDate: '2026-04-05',
    serviceLabel: 'Ibadah Umum 1',
    accountId: f.cash,
    counter1UserId: counter.user.id,
    counter2Name: 'Ibu Sari Simanjuntak',
    lines: [
      {
        fundId: f.general,
        categoryId: f.category('Persembahan Ibadah'),
        method: 'cash',
        amount: 1_385_000,
        denominations: { '100000': 10, '50000': 6, '20000': 4, '5000': 1 },
      },
      { fundId: f.building, method: 'qris', amount: 250_000 },
    ],
    ...overrides,
  });

  beforeAll(async () => {
    s = await seedChurch(t);
    f = await setupFinance(t, s);
    counter = await memberWithRole(t, s, 'Counter', ['finance.record']);
    counter2 = await memberWithRole(t, s, 'Counter Two', ['finance.record', 'finance.approve']);
    verifier = await memberWithRole(t, s, 'Verifier', ['finance.approve']);
    viewer = await memberWithRole(t, s, 'Viewer', ['finance.view']);
    manager = await memberWithRole(t, s, 'Manager', ['finance.manage']);
  });

  describe('offering counts', () => {
    let batchId = '';

    it('validates the count: two different counters and matching denominations', async () => {
      const oneCounter = await t.request('POST', `${f.base}/offerings`, {
        token: counter.token,
        body: offering({ counter2Name: null }),
      });
      expect(oneCounter.status).toBe(422);
      expect(oneCounter.json.error.issues[0].path).toBe('counter2Name');

      const sameCounter = await t.request('POST', `${f.base}/offerings`, {
        token: counter.token,
        body: offering({ counter2UserId: counter.user.id, counter2Name: null }),
      });
      expect(sameCounter.status).toBe(422);

      const mismatch = await t.request('POST', `${f.base}/offerings`, {
        token: counter.token,
        body: offering({
          lines: [{ fundId: f.general, amount: 100_000, denominations: { '50000': 1 } }],
        }),
      });
      expect(mismatch.status).toBe(422);
      expect(mismatch.json.error.issues[0].path).toBe('lines.0.amount');

      const empty = await t.request('POST', `${f.base}/offerings`, {
        token: counter.token,
        body: offering({ lines: [{ fundId: f.general, amount: 0 }] }),
      });
      expect(empty.status).toBe(422);

      const expenseCategory = await t.request('POST', `${f.base}/offerings`, {
        token: counter.token,
        body: offering({
          lines: [{ fundId: f.general, categoryId: f.category('Honorarium'), amount: 10_000 }],
        }),
      });
      expect(expenseCategory.status).toBe(400);
    });

    it('lets recorders count a draft and refuses everyone else', async () => {
      for (const token of [s.member.token, s.leader.token, viewer.token, verifier.token]) {
        const denied = await t.request('POST', `${f.base}/offerings`, { token, body: offering() });
        expect(denied.status).toBe(403);
      }
      const created = await t.request('POST', `${f.base}/offerings`, {
        token: counter.token,
        body: offering(),
      });
      expect(created.status).toBe(201);
      expect(created.json.batch.status).toBe('draft');
      expect(created.json.batch.totalAmount).toBe(1_635_000);
      expect(created.json.batch.lines[0].denominations).toEqual({
        '100000': 10,
        '50000': 6,
        '20000': 4,
        '5000': 1,
      });
      // Non-cash lines never keep a denomination count.
      expect(created.json.batch.lines[1].denominations).toEqual({});
      expect(created.json.batch.canVerify).toBe(false);
      batchId = created.json.batch.id;

      const edited = await t.request('PATCH', `${f.base}/offerings/${batchId}`, {
        token: counter2.token,
        body: offering({
          lines: [{ fundId: f.general, method: 'cash', amount: 1_400_000 }],
          notes: 'Satu amplop terlambat',
        }),
      });
      expect(edited.status).toBe(200);
      expect(edited.json.batch.totalAmount).toBe(1_400_000);
      expect(edited.json.batch.updatedBy).toBe(counter2.user.id);
    });

    it('notifies verifiers on submit and keeps counters, submitter and editor from verifying', async () => {
      const submitted = await t.request('POST', `${f.base}/offerings/${batchId}/submit`, {
        token: counter.token,
      });
      expect(submitted.status).toBe(200);
      expect(submitted.json.batch.status).toBe('submitted');
      const again = await t.request('POST', `${f.base}/offerings/${batchId}/submit`, {
        token: counter.token,
      });
      expect(again.status).toBe(409);

      const notices = await notificationsOf(t, verifier.token);
      expect(notices.some((notice) => notice.type === 'finance.offering_submitted')).toBe(true);
      expect(notices[0]?.link).toBe(`/c/${s.church.id}/finance/offerings/${batchId}`);
      const counterNotices = await notificationsOf(t, counter.token);
      expect(counterNotices.some((notice) => notice.type === 'finance.offering_submitted')).toBe(
        false,
      );

      // counter2 edited the count, so they cannot verify it.
      const editor = await t.request('POST', `${f.base}/offerings/${batchId}/verify`, {
        token: counter2.token,
      });
      expect(editor.status).toBe(403);
      expect(editor.json.error.code).toBe('SELF_APPROVAL');

      const editWhileSubmitted = await t.request('PATCH', `${f.base}/offerings/${batchId}`, {
        token: counter.token,
        body: offering(),
      });
      expect(editWhileSubmitted.status).toBe(409);

      const pending = await t.request('GET', `${f.base}/pending`, { token: verifier.token });
      expect(pending.json).toEqual({ batches: 1, expenses: 0, total: 1 });
      const pendingCounter2 = await t.request('GET', `${f.base}/pending`, {
        token: counter2.token,
      });
      expect(pendingCounter2.json.batches).toBe(0);
    });

    it('returns a count for correction and notifies the submitter', async () => {
      const returned = await t.request('POST', `${f.base}/offerings/${batchId}/return`, {
        token: verifier.token,
        body: { reason: 'Hitung ulang amplop' },
      });
      expect(returned.status).toBe(200);
      expect(returned.json.batch.status).toBe('draft');
      expect(returned.json.batch.notes).toContain('Hitung ulang amplop');
      const notices = await notificationsOf(t, counter.token);
      expect(notices.some((notice) => notice.type === 'finance.offering_returned')).toBe(true);
      await t.request('POST', `${f.base}/offerings/${batchId}/submit`, { token: counter.token });
    });

    it('posts the ledger when an independent verifier verifies', async () => {
      const before = await t.request('GET', `${f.base}/setup`, { token: viewer.token });
      const cashBefore = before.json.accounts.find((a: { id: string }) => a.id === f.cash).balance;

      const detail = await t.request('GET', `${f.base}/offerings/${batchId}`, {
        token: verifier.token,
      });
      expect(detail.json.batch.canVerify).toBe(true);

      const verified = await t.request('POST', `${f.base}/offerings/${batchId}/verify`, {
        token: verifier.token,
      });
      expect(verified.status).toBe(200);
      expect(verified.json.batch.status).toBe('verified');
      expect(verified.json.batch.verifiedByName).toBe('Verifier');

      const after = await t.request('GET', `${f.base}/setup`, { token: viewer.token });
      const cashAfter = after.json.accounts.find((a: { id: string }) => a.id === f.cash).balance;
      expect(cashAfter - cashBefore).toBe(1_400_000);

      const entries = await t.request('GET', `${f.base}/entries?sourceType=offering`, {
        token: viewer.token,
      });
      expect(entries.json.total).toBe(1);
      expect(entries.json.items[0].description).toContain('Ibadah Umum 1');

      const twice = await t.request('POST', `${f.base}/offerings/${batchId}/verify`, {
        token: verifier.token,
      });
      expect(twice.status).toBe(409);
      const editVerified = await t.request('PATCH', `${f.base}/offerings/${batchId}`, {
        token: counter.token,
        body: offering(),
      });
      expect(editVerified.status).toBe(409);

      const audit = await financeAudit(t, s, `&entityId=${batchId}`);
      expect(audit.map((entry) => entry.action)).toEqual([
        'offering_batch.verify',
        'offering_batch.submit',
        'offering_batch.return',
        'offering_batch.submit',
        'offering_batch.update',
        'offering_batch.create',
      ]);
      expect(audit.at(-1)?.after.lines).toHaveLength(2);
    });

    it('lists counts with filters for viewers and recorders, not members', async () => {
      const list = await t.request('GET', `${f.base}/offerings?status=verified`, {
        token: viewer.token,
      });
      expect(list.status).toBe(200);
      expect(list.json.total).toBe(1);
      const byLabel = await t.request('GET', `${f.base}/offerings?q=umum`, {
        token: counter.token,
      });
      expect(byLabel.json.total).toBe(1);
      const outOfRange = await t.request('GET', `${f.base}/offerings?from=2026-05-01`, {
        token: counter.token,
      });
      expect(outOfRange.json.total).toBe(0);
      expect(
        (await t.request('GET', `${f.base}/offerings`, { token: s.member.token })).status,
      ).toBe(403);
    });

    it('voids: counters discard their own drafts, managers void verified counts', async () => {
      const draft = await t.request('POST', `${f.base}/offerings`, {
        token: counter.token,
        body: offering({ serviceLabel: 'Ibadah Pemuda' }),
      });
      const otherCounter = await t.request(
        'POST',
        `${f.base}/offerings/${draft.json.batch.id}/void`,
        { token: counter2.token, body: { reason: 'Duplikat' } },
      );
      expect(otherCounter.status).toBe(403);
      const own = await t.request('POST', `${f.base}/offerings/${draft.json.batch.id}/void`, {
        token: counter.token,
        body: { reason: 'Duplikat' },
      });
      expect(own.status).toBe(200);
      expect(own.json.batch.status).toBe('voided');

      const verifiedByCounter = await t.request('POST', `${f.base}/offerings/${batchId}/void`, {
        token: counter.token,
        body: { reason: 'Salah' },
      });
      expect(verifiedByCounter.status).toBe(403);
      const missingReason = await t.request('POST', `${f.base}/offerings/${batchId}/void`, {
        token: manager.token,
        body: { reason: '' },
      });
      expect(missingReason.status).toBe(422);
      const voided = await t.request('POST', `${f.base}/offerings/${batchId}/void`, {
        token: manager.token,
        body: { reason: 'Dicatat dua kali' },
      });
      expect(voided.status).toBe(200);
      const entries = await t.request('GET', `${f.base}/entries?sourceType=offering`, {
        token: viewer.token,
      });
      expect(entries.json.total).toBe(0);
    });

    it('hides another church’s counts and refuses its accounts', async () => {
      const other = await otherChurch(t);
      const foreign = await t.request('POST', `${other.base}/offerings`, {
        token: other.owner.token,
        body: {
          serviceDate: '2026-04-05',
          accountId: other.setup.accounts[0]!.id,
          counter1Name: 'A',
          counter2Name: 'B',
          lines: [{ fundId: other.setup.funds[0]!.id, amount: 10_000 }],
        },
      });
      expect(foreign.status).toBe(201);
      const id = foreign.json.batch.id;
      expect(
        (await t.request('GET', `${f.base}/offerings/${id}`, { token: s.owner.token })).status,
      ).toBe(404);
      expect(
        (await t.request('POST', `${f.base}/offerings/${id}/verify`, { token: verifier.token }))
          .status,
      ).toBe(404);
      const foreignAccount = await t.request('POST', `${f.base}/offerings`, {
        token: counter.token,
        body: offering({ accountId: other.setup.accounts[0]!.id }),
      });
      expect(foreignAccount.status).toBe(404);
      const foreignCounter = await t.request('POST', `${f.base}/offerings`, {
        token: counter.token,
        body: offering({ counter1UserId: other.owner.user.id }),
      });
      expect(foreignCounter.status).toBe(404);
    });
  });

  describe('contributions', () => {
    let tithe = '';

    it('records giving with receipt numbers and the suggested category', async () => {
      const denied = await t.request('POST', `${f.base}/contributions`, {
        token: viewer.token,
        body: {
          personId: s.memberPerson.id,
          kind: 'tithe',
          fundId: f.general,
          accountId: f.bank,
          method: 'transfer',
          amount: 500_000,
          receivedAt: '2026-04-06',
        },
      });
      expect(denied.status).toBe(403);

      const created = await t.request('POST', `${f.base}/contributions`, {
        token: counter.token,
        body: {
          personId: s.memberPerson.id,
          kind: 'tithe',
          fundId: f.general,
          accountId: f.bank,
          method: 'transfer',
          amount: 500_000,
          receivedAt: '2026-04-06',
          reference: 'TRX-0042',
        },
      });
      expect(created.status).toBe(201);
      expect(created.json.contribution.receiptNumber).toBe('KW-2026-00001');
      expect(created.json.contribution.categoryName).toBe('Perpuluhan');
      expect(created.json.contribution.person.firstName).toBe('Mem');
      tithe = created.json.contribution.id;

      const anonymous = await t.request('POST', `${f.base}/contributions`, {
        token: counter.token,
        body: {
          kind: 'thanksgiving',
          fundId: f.general,
          accountId: f.cash,
          method: 'cash',
          amount: 200_000,
          receivedAt: '2026-04-06',
          note: 'Syukur ulang tahun pernikahan',
        },
      });
      expect(anonymous.status).toBe(201);
      expect(anonymous.json.contribution.receiptNumber).toBe('KW-2026-00002');
      expect(anonymous.json.contribution.person).toBeNull();

      const zero = await t.request('POST', `${f.base}/contributions`, {
        token: counter.token,
        body: {
          kind: 'donation',
          fundId: f.general,
          accountId: f.cash,
          method: 'cash',
          amount: 0,
          receivedAt: '2026-04-06',
        },
      });
      expect(zero.status).toBe(422);
      expect(zero.json.error.issues[0].path).toBe('amount');

      const list = await t.request('GET', `${f.base}/contributions?kind=tithe`, {
        token: viewer.token,
      });
      expect(list.json.total).toBe(1);
      expect(list.json.totalAmount).toBe(500_000);
      const search = await t.request('GET', `${f.base}/contributions?q=Mem%20Ber`, {
        token: viewer.token,
      });
      expect(search.json.total).toBe(1);
      expect(
        (await t.request('GET', `${f.base}/contributions`, { token: counter.token })).status,
      ).toBe(403);
    });

    it('shows receipts to the giver and finance viewers only', async () => {
      const own = await t.request('GET', `${f.base}/contributions/${tithe}`, {
        token: s.member.token,
      });
      expect(own.status).toBe(200);
      expect(own.json.contribution.receiptNumber).toBe('KW-2026-00001');
      const other = await t.request('GET', `${f.base}/contributions/${tithe}`, {
        token: s.leader.token,
      });
      expect(other.status).toBe(404);
      const asViewer = await t.request('GET', `${f.base}/contributions/${tithe}`, {
        token: viewer.token,
      });
      expect(asViewer.status).toBe(200);
    });

    it('corrects a gift by voiding and reposting its ledger line', async () => {
      const corrected = await t.request('PATCH', `${f.base}/contributions/${tithe}`, {
        token: counter.token,
        body: {
          personId: s.memberPerson.id,
          kind: 'tithe',
          fundId: f.general,
          accountId: f.bank,
          method: 'transfer',
          amount: 550_000,
          receivedAt: '2026-04-06',
          reference: 'TRX-0042',
        },
      });
      expect(corrected.status).toBe(200);
      expect(corrected.json.contribution.amount).toBe(550_000);
      expect(corrected.json.contribution.receiptNumber).toBe('KW-2026-00001');
      const entries = await t.request(
        'GET',
        `${f.base}/entries?sourceType=contribution&includeVoided=true&accountId=${f.bank}`,
        { token: viewer.token },
      );
      const lines = entries.json.items.filter(
        (entry: { sourceId: string }) => entry.sourceId === tithe,
      );
      expect(lines).toHaveLength(2);
      expect(lines.filter((entry: { voidedAt: string | null }) => !entry.voidedAt)[0].amount).toBe(
        550_000,
      );
      const audit = await financeAudit(t, s, `&entityId=${tithe}`);
      expect(audit[0]?.action).toBe('contribution.update');
      expect(audit[0]?.before).toEqual({ amount: 500_000 });
      expect(audit[0]?.after).toEqual({ amount: 550_000 });
    });

    it('builds giving statements: my giving, per person and the yearly list', async () => {
      const mine = await t.request('GET', `${f.base}/my-giving?year=2026`, {
        token: s.member.token,
      });
      expect(mine.status).toBe(200);
      expect(mine.json.statement.total).toBe(550_000);
      expect(mine.json.statement.byKind).toEqual([{ kind: 'tithe', amount: 550_000 }]);
      expect(mine.json.statement.items).toHaveLength(1);

      const noPerson = await t.request('GET', `${f.base}/my-giving?year=2026`, {
        token: s.leader.token,
      });
      expect(noPerson.status).toBe(200);
      expect(noPerson.json.statement).toBeNull();

      const ownStatement = await t.request(
        'GET',
        `${f.base}/giving-statements/${s.memberPerson.id}?year=2026`,
        { token: s.member.token },
      );
      expect(ownStatement.status).toBe(200);
      const otherStatement = await t.request(
        'GET',
        `${f.base}/giving-statements/${s.alice.id}?year=2026`,
        { token: s.member.token },
      );
      expect(otherStatement.status).toBe(403);

      const reporter = await memberWithRole(t, s, 'Reporter', ['finance.reports']);
      const list = await t.request('GET', `${f.base}/giving-statements?year=2026`, {
        token: reporter.token,
      });
      expect(list.status).toBe(200);
      expect(list.json.items).toHaveLength(1);
      expect(list.json.items[0].total).toBe(550_000);
      expect(list.json.anonymousTotal).toBe(200_000);
      expect(
        (await t.request('GET', `${f.base}/giving-statements?year=2026`, { token: viewer.token }))
          .status,
      ).toBe(403);
      const csv = await t.app.handle(
        new Request(`http://localhost${f.base}/giving-statements?year=2026&format=csv`, {
          headers: { authorization: `Bearer ${reporter.token}` },
        }),
      );
      expect(await csv.text()).toContain('Mem Ber,1,550000,2026-04-06');
    });

    it('voids gifts (finance.manage) and refuses another church’s people', async () => {
      const notManager = await t.request('POST', `${f.base}/contributions/${tithe}/void`, {
        token: counter.token,
        body: { reason: 'Transfer ganda' },
      });
      expect(notManager.status).toBe(403);
      const voided = await t.request('POST', `${f.base}/contributions/${tithe}/void`, {
        token: manager.token,
        body: { reason: 'Transfer ganda' },
      });
      expect(voided.status).toBe(200);
      expect(voided.json.contribution.voidReason).toBe('Transfer ganda');
      const correctVoided = await t.request('PATCH', `${f.base}/contributions/${tithe}`, {
        token: counter.token,
        body: {
          kind: 'tithe',
          fundId: f.general,
          accountId: f.bank,
          method: 'transfer',
          amount: 1,
          receivedAt: '2026-04-06',
        },
      });
      expect(correctVoided.status).toBe(409);
      const mine = await t.request('GET', `${f.base}/my-giving?year=2026`, {
        token: s.member.token,
      });
      expect(mine.json.statement.total).toBe(0);

      const other = await otherChurch(t);
      const person = await t.createPerson(other.owner.token, other.church.id, {
        firstName: 'Asing',
      });
      const foreign = await t.request('POST', `${f.base}/contributions`, {
        token: counter.token,
        body: {
          personId: person.id,
          kind: 'tithe',
          fundId: f.general,
          accountId: f.cash,
          method: 'cash',
          amount: 1_000,
          receivedAt: '2026-04-06',
        },
      });
      expect(foreign.status).toBe(404);
      const foreignStatement = await t.request(
        'GET',
        `${f.base}/giving-statements/${person.id}?year=2026`,
        { token: s.owner.token },
      );
      expect(foreignStatement.status).toBe(404);
    });

    it('lists donors for recorders and church members for counter pickers', async () => {
      const donors = await t.request('GET', `${f.base}/donors?q=ali`, { token: counter.token });
      expect(donors.status).toBe(200);
      expect(donors.json.items.map((p: { firstName: string }) => p.firstName)).toEqual(['Alice']);
      expect((await t.request('GET', `${f.base}/donors`, { token: s.member.token })).status).toBe(
        403,
      );
      const members = await t.request('GET', `${f.base}/members?q=verif`, { token: counter.token });
      expect(members.json.items).toEqual([{ userId: verifier.user.id, name: 'Verifier' }]);
    });
  });
});
