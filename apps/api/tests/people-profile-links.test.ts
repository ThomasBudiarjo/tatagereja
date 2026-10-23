import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { dayOffset } from './care-helpers';
import { setupFinance } from './finance-helpers';
import { createTestApp, seedChurch } from './helpers';
import { baptism } from './records-fixtures';

/*
 * A profile shows how many care cases, gifts and records a person has, and links to the list
 * filtered by `personId`. The count and the list behind the link must agree for every caller.
 */
describe('people: profile links match the lists they open', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let f: Awaited<ReturnType<typeof setupFinance>>;
  let church: string;

  const profile = async (token: string, personId: string) => {
    const response = await t.request('GET', `${church}/people/${personId}`, { token });
    expect(response.status).toBe(200);
    return response.json.links as {
      care: { open: number } | null;
      giving: { count: number } | null;
      records: { count: number } | null;
    };
  };
  const total = async (token: string, url: string) => {
    const response = await t.request('GET', url, { token });
    expect(response.status).toBe(200);
    return response.json.total as number;
  };
  const gift = (personId: string, amount: number) =>
    t.request('POST', `${f.base}/contributions`, {
      token: s.owner.token,
      body: {
        personId,
        kind: 'tithe',
        fundId: f.general,
        accountId: f.bank,
        method: 'transfer',
        amount,
        receivedAt: '2026-04-06',
      },
    });

  beforeAll(async () => {
    s = await seedChurch(t);
    church = `/api/churches/${s.church.id}`;
    f = await setupFinance(t, s);

    const cases = [
      { personId: s.alice.id, title: 'Opname di RS Immanuel', confidentiality: 'normal' },
      { personId: s.alice.id, title: 'Konseling keluarga', confidentiality: 'confidential' },
      { personId: s.memberPerson.id, title: 'Berduka', confidentiality: 'normal' },
    ];
    for (const item of cases) {
      const created = await t.request('POST', `${church}/care/cases`, {
        token: s.owner.token,
        body: {
          ...item,
          category: 'hospital',
          priority: 'normal',
          nextActionDate: dayOffset(3),
        },
      });
      expect(created.status).toBe(201);
    }

    for (const [personId, amount] of [
      [s.alice.id, 500_000],
      [s.alice.id, 250_000],
      [s.memberPerson.id, 100_000],
    ] as const) {
      expect((await gift(personId, amount)).status).toBe(201);
    }

    // The member witnessed Alice's baptism: the register counts it for them, their own list does not.
    for (const body of [
      baptism(s.alice.id, {
        people: [
          { personId: s.alice.id, role: 'subject' },
          { personId: s.memberPerson.id, role: 'witness' },
        ],
      }),
      baptism(s.memberPerson.id),
    ]) {
      const record = await t.request('POST', `${church}/records/entries`, {
        token: s.owner.token,
        body,
      });
      expect(record.status).toBe(201);
    }
  });

  it('counts what the filtered lists show for the module teams', async () => {
    for (const token of [s.owner.token, s.admin.token]) {
      const links = await profile(token, s.alice.id);
      expect(links.care).not.toBeNull();
      expect(links.giving?.count).toBe(2);
      expect(links.records?.count).toBe(1);
      expect(await total(token, `${church}/care/cases?personId=${s.alice.id}&status=active`)).toBe(
        links.care!.open,
      );
      expect(await total(token, `${f.base}/contributions?personId=${s.alice.id}`)).toBe(
        links.giving!.count,
      );
      expect(
        await total(token, `${church}/records/entries?personId=${s.alice.id}&status=active`),
      ).toBe(links.records!.count);
    }
    // The owner holds care.confidential; the administrator does not.
    expect((await profile(s.owner.token, s.alice.id)).care?.open).toBe(2);
    expect((await profile(s.admin.token, s.alice.id)).care?.open).toBe(1);
  });

  it('links a member to their own giving and records, never to care', async () => {
    const own = await profile(s.member.token, s.memberPerson.id);
    expect(own.care).toBeNull();
    expect(own.giving?.count).toBe(1);
    expect(own.records?.count).toBe(1);
    // The profile links a member to their own pages, which show the same numbers.
    const giving = await t.request('GET', `${f.base}/my-giving?year=2026`, {
      token: s.member.token,
    });
    expect(giving.status).toBe(200);
    expect(giving.json.statement.items).toHaveLength(own.giving!.count);
    const records = await t.request('GET', `${church}/people/${s.memberPerson.id}/records`, {
      token: s.member.token,
    });
    expect(records.status).toBe(200);
    expect(records.json.items).toHaveLength(own.records!.count);
    expect((await profile(s.owner.token, s.memberPerson.id)).records?.count).toBe(2);

    const other = await profile(s.member.token, s.alice.id);
    expect(other).toEqual({ care: null, giving: null, records: null });
  });
});
