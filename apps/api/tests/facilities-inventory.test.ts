import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { assetLoans } from '../src/db/schema';
import {
  createAsset,
  createResource,
  seedFacilities,
  type FacilitiesSeed,
} from './facilities-fixtures';
import { createTestApp, seedChurch } from './helpers';

const isoDay = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('facilities: inventory, loans and maintenance', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let f: FacilitiesSeed;

  const auditOf = async (entityId: string) => {
    const response = await t.request(
      'GET',
      `/api/churches/${f.s.church.id}/audit-logs?module=facilities&entityId=${entityId}`,
      { token: f.s.owner.token },
    );
    expect(response.status).toBe(200);
    return response.json.items as { action: string; summary: string }[];
  };

  beforeAll(async () => {
    f = await seedFacilities(t);
  });

  it('numbers assets per church and lets inventory keepers manage them', async () => {
    const hall = await createResource(t, f, { name: 'Aula Utama', kind: 'hall' });
    const first = await t.request('POST', `${f.inventory}/assets`, {
      token: f.keeper.token,
      body: {
        name: 'Mixer Yamaha MG16',
        category: 'Sound system',
        resourceId: hall.id,
        condition: 'good',
        acquisitionDate: '2024-03-12',
        acquisitionValue: 8_500_000,
        custodianPersonId: f.s.alice.id,
        serialNumber: 'YMG16-0042',
      },
    });
    expect(first.status).toBe(201);
    expect(first.json.asset).toMatchObject({
      code: 'INV-0001',
      status: 'available',
      resourceName: 'Aula Utama',
      acquisitionValue: 8_500_000,
      custodian: { id: f.s.alice.id, firstName: 'Alice' },
      currentLoan: null,
    });
    const second = await createAsset(t, f, { name: 'Kursi Lipat Chitose' });
    expect(second.code).toBe('INV-0002');

    // Deleting does not free the code: the next asset still gets a new number.
    expect(
      (await t.request('DELETE', `${f.inventory}/assets/${second.id}`, { token: f.keeper.token }))
        .status,
    ).toBe(200);
    const third = await createAsset(t, f, { name: 'Keyboard Roland' });
    expect(third.code).toBe('INV-0003');
    const fourth = await createAsset(t, f, { name: 'Gitar Akustik' });
    expect(fourth.code).toBe('INV-0004');

    const id = first.json.asset.id;
    const updated = await t.request('PATCH', `${f.inventory}/assets/${id}`, {
      token: f.keeper.token,
      body: {
        name: 'Mixer Yamaha MG16XU',
        category: 'Sound system',
        resourceId: hall.id,
        condition: 'fair',
        acquisitionValue: 8_500_000,
        custodianPersonId: f.s.alice.id,
      },
    });
    expect(updated.status).toBe(200);
    expect(updated.json.asset).toMatchObject({ name: 'Mixer Yamaha MG16XU', condition: 'fair' });

    const actions = (await auditOf(id)).map((item) => item.action);
    expect(actions).toEqual(expect.arrayContaining(['asset.create', 'asset.update']));
    const deleted = await t.request(
      'GET',
      `/api/churches/${f.s.church.id}/audit-logs?module=facilities&action=asset.delete`,
      { token: f.s.owner.token },
    );
    expect(deleted.json.items[0].summary).toContain('INV-0002 Kursi Lipat Chitose');
  });

  it('enforces the inventory permission matrix', async () => {
    const asset = await createAsset(t, f, { name: 'Proyektor BenQ' });
    const body = { name: 'Proyektor BenQ MX' };
    // Viewing needs inventory.view; members and facilities managers do not hold it.
    for (const token of [f.s.member.token, f.s.leader.token, f.manager.token]) {
      expect((await t.request('GET', `${f.inventory}/assets`, { token })).status).toBe(403);
      expect((await t.request('GET', `${f.inventory}/assets/${asset.id}`, { token })).status).toBe(
        403,
      );
      expect((await t.request('GET', `${f.inventory}/loans`, { token })).status).toBe(403);
    }
    for (const token of [f.viewer.token, f.keeper.token, f.s.admin.token, f.s.owner.token]) {
      expect((await t.request('GET', `${f.inventory}/assets`, { token })).status).toBe(200);
    }
    // Writes need inventory.manage; a viewer may only look.
    for (const token of [f.viewer.token, f.s.member.token, f.manager.token]) {
      expect((await t.request('POST', `${f.inventory}/assets`, { token, body })).status).toBe(403);
      expect(
        (await t.request('PATCH', `${f.inventory}/assets/${asset.id}`, { token, body })).status,
      ).toBe(403);
      expect(
        (await t.request('DELETE', `${f.inventory}/assets/${asset.id}`, { token })).status,
      ).toBe(403);
      expect(
        (
          await t.request('POST', `${f.inventory}/assets/${asset.id}/loans`, {
            token,
            body: { borrowerName: 'Budi' },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await t.request('POST', `${f.inventory}/assets/${asset.id}/maintenance`, {
            token,
            body: { date: isoDay(0), description: 'Ganti lampu' },
          })
        ).status,
      ).toBe(403);
    }
    // The overview shows inventory figures only to those who may see the inventory.
    const asViewer = await t.request('GET', `${f.base}/overview`, { token: f.viewer.token });
    expect(asViewer.json.inventory).not.toBeNull();
    const asManager = await t.request('GET', `${f.base}/overview`, { token: f.manager.token });
    expect(asManager.json.inventory).toBeNull();
  });

  it('validates assets and their links', async () => {
    const invalid = await t.request('POST', `${f.inventory}/assets`, {
      token: f.keeper.token,
      body: {
        name: '',
        condition: 'shiny',
        status: 'on_loan',
        acquisitionValue: 12.5,
        acquisitionDate: '12/03/2024',
      },
    });
    expect(invalid.status).toBe(422);
    const paths = invalid.json.error.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'name',
        'condition',
        'status',
        'acquisitionValue',
        'acquisitionDate',
      ]),
    );
    const ghostPerson = await t.request('POST', `${f.inventory}/assets`, {
      token: f.keeper.token,
      body: { name: 'Kamera Canon', custodianPersonId: crypto.randomUUID() },
    });
    expect(ghostPerson.status).toBe(404);
  });

  it('checks assets out and back in, tracking status, condition and overdue loans', async () => {
    const asset = await createAsset(t, f, { name: 'Tenda Lipat 3x3', category: 'Perlengkapan' });
    const memberPersonId = f.s.memberPerson.id;

    const early = await t.request('POST', `${f.inventory}/assets/${asset.id}/loans`, {
      token: f.keeper.token,
      body: { borrowerPersonId: memberPersonId, dueDate: isoDay(-1) },
    });
    expect(early.status).toBe(422);
    expect(early.json.error.issues[0].path).toBe('dueDate');

    const nobody = await t.request('POST', `${f.inventory}/assets/${asset.id}/loans`, {
      token: f.keeper.token,
      body: { dueDate: isoDay(3) },
    });
    expect(nobody.status).toBe(422);
    expect(nobody.json.error.issues[0].path).toBe('borrowerPersonId');

    const lent = await t.request('POST', `${f.inventory}/assets/${asset.id}/loans`, {
      token: f.keeper.token,
      body: {
        borrowerPersonId: memberPersonId,
        groupId: f.s.group.id,
        dueDate: isoDay(3),
        notes: 'Untuk retret pemuda',
      },
    });
    expect(lent.status).toBe(201);
    expect(lent.json.loan).toMatchObject({
      borrowerName: 'Mem Ber',
      borrower: { id: memberPersonId },
      groupName: 'Youth Ministry',
      conditionOut: 'good',
      isOverdue: false,
      returnedAt: null,
    });
    const loanId = lent.json.loan.id;

    // The borrower has an account and hears about it.
    const notices = await t.request('GET', '/api/notifications', { token: f.s.member.token });
    expect(
      notices.json.items.find((item: { type: string }) => item.type === 'asset.checked_out')?.link,
    ).toBe(`/c/${f.s.church.id}/facilities/inventory/${asset.id}`);

    const detail = await t.request('GET', `${f.inventory}/assets/${asset.id}`, {
      token: f.viewer.token,
    });
    expect(detail.json.asset).toMatchObject({
      status: 'on_loan',
      currentLoanId: loanId,
      currentLoan: { borrowerName: 'Mem Ber', isOverdue: false },
    });

    const twice = await t.request('POST', `${f.inventory}/assets/${asset.id}/loans`, {
      token: f.keeper.token,
      body: { borrowerName: 'Pak Yohanes' },
    });
    expect(twice.status).toBe(409);
    const retire = await t.request('PATCH', `${f.inventory}/assets/${asset.id}`, {
      token: f.keeper.token,
      body: { name: asset.name, status: 'retired' },
    });
    expect(retire.status).toBe(409);
    expect(
      (await t.request('DELETE', `${f.inventory}/assets/${asset.id}`, { token: f.keeper.token }))
        .status,
    ).toBe(409);

    // Editing details while on loan keeps the loan status.
    const renamed = await t.request('PATCH', `${f.inventory}/assets/${asset.id}`, {
      token: f.keeper.token,
      body: { name: 'Tenda Lipat Biru 3x3', category: 'Perlengkapan' },
    });
    expect(renamed.json.asset.status).toBe('on_loan');

    // Make the loan overdue.
    t.db
      .update(assetLoans)
      .set({ dueDate: isoDay(-2) })
      .where(eq(assetLoans.id, loanId))
      .run();
    const overdue = await t.request('GET', `${f.inventory}/loans?scope=overdue`, {
      token: f.viewer.token,
    });
    expect(overdue.json.items.map((item: { id: string }) => item.id)).toContain(loanId);
    expect(overdue.json.items[0].isOverdue).toBe(true);
    const overview = await t.request('GET', `${f.base}/overview`, { token: f.keeper.token });
    expect(overview.json.inventory).toMatchObject({ onLoan: 1, overdue: 1 });
    expect(overview.json.inventory.overdueLoans[0].id).toBe(loanId);

    const searched = await t.request('GET', `${f.inventory}/loans?scope=all&q=tenda`, {
      token: f.viewer.token,
    });
    expect(searched.json.total).toBe(1);

    const returned = await t.request('POST', `${f.inventory}/loans/${loanId}/return`, {
      token: f.keeper.token,
      body: { conditionIn: 'broken', notes: 'Satu tiang patah' },
    });
    expect(returned.status).toBe(200);
    expect(returned.json.loan).toMatchObject({ conditionIn: 'broken', isOverdue: false });
    const after = await t.request('GET', `${f.inventory}/assets/${asset.id}`, {
      token: f.viewer.token,
    });
    expect(after.json.asset).toMatchObject({
      status: 'maintenance',
      condition: 'broken',
      currentLoan: null,
    });
    expect(after.json.loans).toHaveLength(1);
    expect(
      (
        await t.request('POST', `${f.inventory}/loans/${loanId}/return`, {
          token: f.keeper.token,
          body: { conditionIn: 'good' },
        })
      ).status,
    ).toBe(409);
    // In maintenance it cannot be lent.
    expect(
      (
        await t.request('POST', `${f.inventory}/assets/${asset.id}/loans`, {
          token: f.keeper.token,
          body: { borrowerName: 'Ibu Sari' },
        })
      ).status,
    ).toBe(409);

    const actions = (await auditOf(asset.id)).map((item) => item.action);
    expect(actions).toEqual(expect.arrayContaining(['asset.check_out', 'asset.return']));

    const open = await t.request('GET', `${f.inventory}/loans`, { token: f.viewer.token });
    expect(open.json.items.some((item: { id: string }) => item.id === loanId)).toBe(false);
    const history = await t.request('GET', `${f.inventory}/loans?scope=returned`, {
      token: f.viewer.token,
    });
    expect(history.json.items[0].id).toBe(loanId);
  });

  it('lends to people without a person record by name', async () => {
    const asset = await createAsset(t, f, { name: 'Kabel Roll 50m' });
    const lent = await t.request('POST', `${f.inventory}/assets/${asset.id}/loans`, {
      token: f.keeper.token,
      body: { borrowerName: 'Panitia Natal RT 05' },
    });
    expect(lent.status).toBe(201);
    expect(lent.json.loan).toMatchObject({ borrowerName: 'Panitia Natal RT 05', borrower: null });
  });

  it('keeps a maintenance log with costs and the next due date', async () => {
    const asset = await createAsset(t, f, { name: 'AC Daikin Ruang Ibadah' });
    const first = await t.request('POST', `${f.inventory}/assets/${asset.id}/maintenance`, {
      token: f.keeper.token,
      body: {
        date: isoDay(-90),
        kind: 'service',
        description: 'Cuci AC dan isi freon',
        cost: 350_000,
        performedBy: 'CV Sejuk Abadi',
        nextDueDate: isoDay(5),
      },
    });
    expect(first.status).toBe(201);
    expect(first.json.maintenance).toMatchObject({
      kind: 'service',
      cost: 350_000,
      createdByName: 'Penjaga Inventaris',
    });
    const invalid = await t.request('POST', `${f.inventory}/assets/${asset.id}/maintenance`, {
      token: f.keeper.token,
      body: { date: isoDay(0), description: 'x', nextDueDate: isoDay(-10), cost: -5 },
    });
    expect(invalid.status).toBe(422);

    let detail = await t.request('GET', `${f.inventory}/assets/${asset.id}`, {
      token: f.viewer.token,
    });
    expect(detail.json.maintenanceCost).toBe(350_000);
    expect(detail.json.asset.nextMaintenanceDate).toBe(isoDay(5));
    const overview = await t.request('GET', `${f.base}/overview`, { token: f.viewer.token });
    expect(overview.json.inventory.maintenanceDue).toBeGreaterThanOrEqual(1);

    // A newer service replaces the planned date.
    const second = await t.request('POST', `${f.inventory}/assets/${asset.id}/maintenance`, {
      token: f.keeper.token,
      body: { date: isoDay(0), kind: 'repair', description: 'Ganti kapasitor', cost: 150_000 },
    });
    expect(second.status).toBe(201);
    detail = await t.request('GET', `${f.inventory}/assets/${asset.id}`, { token: f.viewer.token });
    expect(detail.json.maintenance.map((item: { kind: string }) => item.kind)).toEqual([
      'repair',
      'service',
    ]);
    expect(detail.json.maintenanceCost).toBe(500_000);
    expect(detail.json.asset.nextMaintenanceDate).toBeNull();

    const removed = await t.request(
      'DELETE',
      `${f.inventory}/maintenance/${second.json.maintenance.id}`,
      { token: f.keeper.token },
    );
    expect(removed.status).toBe(200);
    detail = await t.request('GET', `${f.inventory}/assets/${asset.id}`, { token: f.viewer.token });
    expect(detail.json.asset.nextMaintenanceDate).toBe(isoDay(5));
    const actions = (await auditOf(asset.id)).map((item) => item.action);
    expect(actions).toEqual(
      expect.arrayContaining(['asset.maintenance_log', 'asset.maintenance_delete']),
    );
  });

  it('filters, searches, sorts and totals the asset list', async () => {
    await createAsset(t, f, {
      name: 'Piano Yamaha U1',
      category: 'Alat musik',
      condition: 'poor',
      acquisitionValue: 45_000_000,
    });
    await createAsset(t, f, {
      name: 'Drum Pearl Export',
      category: 'Alat musik',
      acquisitionValue: 15_000_000,
    });
    const music = await t.request(
      'GET',
      `${f.inventory}/assets?category=${encodeURIComponent('Alat musik')}&sort=-value`,
      { token: f.viewer.token },
    );
    expect(music.json.items.map((item: { name: string }) => item.name)).toEqual([
      'Piano Yamaha U1',
      'Drum Pearl Export',
    ]);
    expect(music.json.totalValue).toBe(60_000_000);
    const poor = await t.request('GET', `${f.inventory}/assets?condition=poor`, {
      token: f.viewer.token,
    });
    expect(poor.json.items.map((item: { name: string }) => item.name)).toEqual(['Piano Yamaha U1']);
    const byCode = await t.request('GET', `${f.inventory}/assets?q=INV-0001`, {
      token: f.viewer.token,
    });
    expect(byCode.json.items[0].code).toBe('INV-0001');
    const paged = await t.request('GET', `${f.inventory}/assets?limit=2&page=2&sort=code`, {
      token: f.viewer.token,
    });
    expect(paged.json).toMatchObject({ page: 2, limit: 2 });
    expect(paged.json.items).toHaveLength(2);
    const categories = await t.request('GET', `${f.inventory}/assets/categories`, {
      token: f.viewer.token,
    });
    expect(categories.json.items).toEqual(
      expect.arrayContaining([{ category: 'Alat musik', count: 2 }]),
    );
    expect(
      (await t.request('GET', `${f.inventory}/assets?sort=price`, { token: f.viewer.token }))
        .status,
    ).toBe(422);
  });

  it('searches people for custodians and borrowers', async () => {
    const found = await t.request('GET', `${f.base}/people?q=ali`, { token: f.keeper.token });
    expect(found.status).toBe(200);
    expect(found.json.items.map((item: { firstName: string }) => item.firstName)).toEqual([
      'Alice',
    ]);
    const byId = await t.request('GET', `${f.base}/people?ids=${f.s.bob.id}`, {
      token: f.manager.token,
    });
    expect(byId.json.items[0].id).toBe(f.s.bob.id);
    expect((await t.request('GET', `${f.base}/people`, { token: f.viewer.token })).status).toBe(
      403,
    );
    expect((await t.request('GET', `${f.base}/people`, { token: f.s.member.token })).status).toBe(
      403,
    );
  });

  it('answers 404 for assets, loans, people and maintenance of another church', async () => {
    const other = await seedChurch(t);
    const otherInventory = `/api/churches/${other.church.id}/inventory`;
    const theirs = await t.request('POST', `${otherInventory}/assets`, {
      token: other.owner.token,
      body: { name: 'Sound System Mereka' },
    });
    expect(theirs.status).toBe(201);
    // Codes are per church.
    expect(theirs.json.asset.code).toBe('INV-0001');
    const assetId = theirs.json.asset.id;
    const loan = await t.request('POST', `${otherInventory}/assets/${assetId}/loans`, {
      token: other.owner.token,
      body: { borrowerName: 'Jemaat Lain' },
    });
    const log = await t.request('POST', `${otherInventory}/assets/${assetId}/maintenance`, {
      token: other.owner.token,
      body: { date: isoDay(0), description: 'Servis rutin' },
    });
    const own = await createAsset(t, f, { name: 'Laptop Multimedia' });

    const attempts = [
      t.request('GET', `${f.inventory}/assets/${assetId}`, { token: f.s.owner.token }),
      t.request('PATCH', `${f.inventory}/assets/${assetId}`, {
        token: f.s.owner.token,
        body: { name: 'Diambil alih' },
      }),
      t.request('DELETE', `${f.inventory}/assets/${assetId}`, { token: f.s.owner.token }),
      t.request('POST', `${f.inventory}/assets/${assetId}/loans`, {
        token: f.s.owner.token,
        body: { borrowerName: 'Siapa saja' },
      }),
      t.request('POST', `${f.inventory}/loans/${loan.json.loan.id}/return`, {
        token: f.s.owner.token,
        body: { conditionIn: 'good' },
      }),
      t.request('POST', `${f.inventory}/assets/${assetId}/maintenance`, {
        token: f.s.owner.token,
        body: { date: isoDay(0), description: 'Servis' },
      }),
      t.request('DELETE', `${f.inventory}/maintenance/${log.json.maintenance.id}`, {
        token: f.s.owner.token,
      }),
      // Their people cannot be linked to our assets.
      t.request('POST', `${f.inventory}/assets/${own.id}/loans`, {
        token: f.s.owner.token,
        body: { borrowerPersonId: other.alice.id },
      }),
      t.request('PATCH', `${f.inventory}/assets/${own.id}`, {
        token: f.s.owner.token,
        body: { name: own.name, custodianPersonId: other.bob.id },
      }),
    ];
    for (const response of await Promise.all(attempts)) expect(response.status).toBe(404);

    const people = await t.request(
      'GET',
      `/api/churches/${f.s.church.id}/facilities/people?ids=${other.alice.id}`,
      {
        token: f.s.owner.token,
      },
    );
    expect(people.json.items).toEqual([]);
    const loans = await t.request('GET', `${f.inventory}/loans?scope=all&assetId=${assetId}`, {
      token: f.s.owner.token,
    });
    expect(loans.json.items).toEqual([]);
  });
});
