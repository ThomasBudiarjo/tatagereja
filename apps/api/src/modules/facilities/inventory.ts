import {
  FACILITIES_LIMITS,
  assetLoanListQuerySchema,
  assetMaintenanceInputSchema,
  checkOutAssetBodySchema,
  churchIdParamsSchema,
  churchParamsSchema,
  facilitiesSettingsSchema,
  formatAssetCode,
  fullName,
  inventoryAssetInputSchema,
  inventoryAssetListQuerySchema,
  returnAssetBodySchema,
  type InventoryAssetInput,
  type ValidationIssue,
} from '@tatagereja/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  or,
  sql,
  sum,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow, InventoryAssetRow } from '../../db/schema';
import { assetLoans, assetMaintenance, churches, inventoryAssets, users } from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, notFound, validationError } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { dateIn, hydrateAssets, hydrateLoans } from '../../services/facilities';
import { moduleSettings, saveModuleSettings } from '../../services/modules';
import { notify } from '../../services/notifications';
import { toAssetMaintenance } from './serializers';
import { loadAsset, loadGroup, loadLoan, loadMaintenance, loadPerson, loadResource } from './load';

const VIEW = ['inventory.view', 'inventory.manage'] as const;
const LOANS_ON_DETAIL = 50;

const snapshot = (row: InventoryAssetRow) => ({
  name: row.name,
  category: row.category,
  description: row.description,
  resourceId: row.resourceId,
  location: row.location,
  condition: row.condition,
  status: row.status,
  acquisitionDate: row.acquisitionDate,
  acquisitionValue: row.acquisitionValue,
  custodianPersonId: row.custodianPersonId,
  serialNumber: row.serialNumber,
  photoUrl: row.photoUrl,
  notes: row.notes,
});

/**
 * The next "INV-0042" code of the church. The highest number handed out is kept in the module
 * settings, so the code of a deleted asset (and its printed label) is never reused.
 */
function nextAssetCode(db: Queryable, churchId: string): string {
  const prefix = FACILITIES_LIMITS.assetCodePrefix;
  const church = db
    .select({ settings: churches.settings })
    .from(churches)
    .where(eq(churches.id, churchId))
    .get();
  const stored = church ? moduleSettings(church, 'facilities', facilitiesSettingsSchema) : null;
  const highest =
    db
      .select({
        value: sql<
          number | null
        >`max(cast(substr(${inventoryAssets.code}, ${prefix.length + 2}) as integer))`,
      })
      .from(inventoryAssets)
      .where(and(eq(inventoryAssets.churchId, churchId), like(inventoryAssets.code, `${prefix}-%`)))
      .get()?.value ?? 0;
  const sequence = Math.max(Number(highest), stored?.assetSequence ?? 0) + 1;
  saveModuleSettings(db, churchId, 'facilities', { ...stored, assetSequence: sequence });
  return formatAssetCode(sequence, prefix);
}

const ASSET_ORDER = {
  code: [asc(inventoryAssets.code)],
  name: [asc(inventoryAssets.name), asc(inventoryAssets.code)],
  '-value': [
    desc(sql`coalesce(${inventoryAssets.acquisitionValue}, -1)`),
    asc(inventoryAssets.code),
  ],
  '-acquired': [
    desc(sql`coalesce(${inventoryAssets.acquisitionDate}, '')`),
    asc(inventoryAssets.code),
  ],
  '-updated': [desc(inventoryAssets.updatedAt), asc(inventoryAssets.code)],
} as const;

/**
 * Inventaris: assets with an automatic code, check-out and return (`asset_loans`, at most one
 * open loan per asset) and the maintenance log. Viewing needs `inventory.view`, every write
 * `inventory.manage`.
 */
export const inventoryRouter = (deps: Deps) => {
  const { db } = deps;

  const today = (church: ChurchRow) => dateIn(church.timezone);

  const hydrateOne = (church: ChurchRow, row: InventoryAssetRow) => {
    const [asset] = hydrateAssets(db, [row], today(church));
    if (!asset) throw notFound('Asset');
    return asset;
  };

  /** Linked rows must belong to the church. */
  const assertLinks = (churchId: string, body: InventoryAssetInput) => {
    if (body.resourceId) loadResource(db, churchId, body.resourceId);
    if (body.custodianPersonId) loadPerson(db, churchId, body.custodianPersonId);
  };

  const assetValues = (body: InventoryAssetInput) => ({
    name: body.name,
    category: body.category,
    description: body.description,
    resourceId: body.resourceId,
    location: body.location,
    condition: body.condition,
    acquisitionDate: body.acquisitionDate,
    acquisitionValue: body.acquisitionValue,
    custodianPersonId: body.custodianPersonId,
    serialNumber: body.serialNumber,
    photoUrl: body.photoUrl,
    notes: body.notes,
  });

  return new Elysia({ prefix: '/churches/:churchId/inventory' })
    .use(authPlugin(deps))
    .get(
      '/assets',
      ({ church, query }) => {
        const conditions: SQL[] = [eq(inventoryAssets.churchId, church.id)];
        if (query.status) conditions.push(eq(inventoryAssets.status, query.status));
        if (query.condition) conditions.push(eq(inventoryAssets.condition, query.condition));
        if (query.category) conditions.push(eq(inventoryAssets.category, query.category));
        if (query.resourceId) conditions.push(eq(inventoryAssets.resourceId, query.resourceId));
        if (query.custodianPersonId) {
          conditions.push(eq(inventoryAssets.custodianPersonId, query.custodianPersonId));
        }
        if (query.q) {
          const pattern = likePattern(query.q);
          const match = or(
            like(inventoryAssets.name, pattern),
            like(inventoryAssets.code, pattern),
            like(inventoryAssets.serialNumber, pattern),
            like(inventoryAssets.location, pattern),
          );
          if (match) conditions.push(match);
        }
        const where = and(...conditions);
        const totals = db
          .select({ total: count(), value: sum(inventoryAssets.acquisitionValue) })
          .from(inventoryAssets)
          .where(where)
          .get();
        const rows = db
          .select()
          .from(inventoryAssets)
          .where(where)
          .orderBy(...ASSET_ORDER[query.sort])
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: hydrateAssets(db, rows, today(church)),
          total: totals?.total ?? 0,
          totalValue: Number(totals?.value ?? 0),
          page: query.page,
          limit: query.limit,
        };
      },
      {
        church: { module: 'facilities', permission: VIEW },
        params: churchParamsSchema,
        query: inventoryAssetListQuerySchema,
      },
    )
    .get(
      '/assets/categories',
      ({ church }) => ({
        items: db
          .select({ category: inventoryAssets.category, count: count() })
          .from(inventoryAssets)
          .where(and(eq(inventoryAssets.churchId, church.id), isNotNull(inventoryAssets.category)))
          .groupBy(inventoryAssets.category)
          .orderBy(asc(inventoryAssets.category))
          .all()
          .flatMap((row) => (row.category ? [{ category: row.category, count: row.count }] : [])),
      }),
      { church: { module: 'facilities', permission: VIEW }, params: churchParamsSchema },
    )
    .post(
      '/assets',
      ({ church, audit, body, set }) => {
        assertLinks(church.id, body);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(inventoryAssets)
            .values({
              id: newId(),
              churchId: church.id,
              code: nextAssetCode(tx, church.id),
              ...assetValues(body),
              status: body.status,
              retiredAt: body.status === 'retired' ? now : null,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'facilities',
            action: 'asset.create',
            entityType: 'inventory_asset',
            entityId: created.id,
            summary: `Added ${created.code} ${created.name} to the inventory`,
            after: snapshot(created),
          });
          return created;
        });
        set.status = 201;
        return { asset: hydrateOne(church, row) };
      },
      {
        church: { module: 'facilities', permission: 'inventory.manage' },
        params: churchParamsSchema,
        body: inventoryAssetInputSchema,
      },
    )
    .get(
      '/assets/:id',
      ({ church, params }) => {
        const row = loadAsset(db, church.id, params.id);
        const loans = db
          .select()
          .from(assetLoans)
          .where(and(eq(assetLoans.churchId, church.id), eq(assetLoans.assetId, row.id)))
          .orderBy(desc(assetLoans.checkedOutAt))
          .limit(LOANS_ON_DETAIL)
          .all();
        const maintenance = db
          .select({ entry: assetMaintenance, createdByName: users.name })
          .from(assetMaintenance)
          .leftJoin(users, eq(users.id, assetMaintenance.createdBy))
          .where(
            and(eq(assetMaintenance.churchId, church.id), eq(assetMaintenance.assetId, row.id)),
          )
          .orderBy(desc(assetMaintenance.date), desc(assetMaintenance.createdAt))
          .all();
        return {
          asset: hydrateOne(church, row),
          loans: hydrateLoans(db, loans, today(church)),
          maintenance: maintenance.map((item) =>
            toAssetMaintenance(item.entry, item.createdByName ?? null),
          ),
          maintenanceCost: maintenance.reduce((total, item) => total + (item.entry.cost ?? 0), 0),
        };
      },
      { church: { module: 'facilities', permission: VIEW }, params: churchIdParamsSchema },
    )
    .patch(
      '/assets/:id',
      ({ church, audit, params, body }) => {
        const row = loadAsset(db, church.id, params.id);
        assertLinks(church.id, body);
        // While lent out the status stays "on loan"; returning the asset changes it.
        if (row.status === 'on_loan' && body.status !== 'available') {
          throw conflict('Return this asset before changing its status');
        }
        const status = row.status === 'on_loan' ? 'on_loan' : body.status;
        const updated = db.transaction((tx) => {
          const next = tx
            .update(inventoryAssets)
            .set({
              ...assetValues(body),
              status,
              retiredAt: status === 'retired' ? (row.retiredAt ?? nowIso()) : null,
              updatedAt: nowIso(),
            })
            .where(eq(inventoryAssets.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Asset');
          recordAudit(tx, audit, {
            module: 'facilities',
            action: 'asset.update',
            entityType: 'inventory_asset',
            entityId: row.id,
            summary: `Updated ${next.code} ${next.name}`,
            ...changes(snapshot(row), snapshot(next)),
          });
          return next;
        });
        return { asset: hydrateOne(church, updated) };
      },
      {
        church: { module: 'facilities', permission: 'inventory.manage' },
        params: churchIdParamsSchema,
        body: inventoryAssetInputSchema,
      },
    )
    .delete(
      '/assets/:id',
      ({ church, audit, params }) => {
        const row = loadAsset(db, church.id, params.id);
        if (row.status === 'on_loan') throw conflict('Return this asset before deleting it');
        db.transaction((tx) => {
          tx.delete(inventoryAssets).where(eq(inventoryAssets.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'facilities',
            action: 'asset.delete',
            entityType: 'inventory_asset',
            entityId: row.id,
            summary: `Deleted ${row.code} ${row.name} with its loans and maintenance log`,
            before: snapshot(row),
          });
        });
        return { ok: true as const };
      },
      {
        church: { module: 'facilities', permission: 'inventory.manage' },
        params: churchIdParamsSchema,
      },
    )
    .post(
      '/assets/:id/loans',
      ({ church, access, auth, audit, params, body, set }) => {
        const asset = loadAsset(db, church.id, params.id);
        if (asset.status !== 'available') {
          throw conflict(
            asset.status === 'on_loan'
              ? `${asset.name} is already on loan`
              : `${asset.name} cannot be lent while it is ${asset.status === 'maintenance' ? 'in maintenance' : asset.status}`,
          );
        }
        const person = body.borrowerPersonId
          ? loadPerson(db, church.id, body.borrowerPersonId)
          : null;
        if (body.groupId) loadGroup(db, church.id, body.groupId);
        const issues: ValidationIssue[] = [];
        if (body.dueDate && body.dueDate < today(church)) {
          issues.push({ path: 'dueDate', message: 'The due date cannot be in the past' });
        }
        if (issues.length > 0) throw validationError('Check the loan details', issues);
        const borrowerName = person ? fullName(person) : (body.borrowerName ?? '');
        const now = nowIso();
        const loan = db.transaction((tx) => {
          const created = tx
            .insert(assetLoans)
            .values({
              id: newId(),
              churchId: church.id,
              assetId: asset.id,
              borrowerPersonId: person?.id ?? null,
              borrowerName,
              groupId: body.groupId,
              checkedOutAt: now,
              dueDate: body.dueDate,
              conditionOut: body.conditionOut ?? asset.condition,
              notes: body.notes,
              checkedOutBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          // The status guard makes a concurrent second check-out fail instead of double-lending.
          const moved = tx
            .update(inventoryAssets)
            .set({ status: 'on_loan', updatedAt: now })
            .where(and(eq(inventoryAssets.id, asset.id), eq(inventoryAssets.status, 'available')))
            .returning({ id: inventoryAssets.id })
            .get();
          if (!moved) throw conflict(`${asset.name} is already on loan`);
          recordAudit(tx, audit, {
            module: 'facilities',
            action: 'asset.check_out',
            entityType: 'inventory_asset',
            entityId: asset.id,
            summary: `Lent ${asset.code} ${asset.name} to ${borrowerName}`,
            after: { loanId: created.id, borrowerName, dueDate: created.dueDate },
          });
          if (person?.userId) {
            notify(tx, {
              churchId: church.id,
              userIds: [person.userId],
              excludeUserIds: [access.userId],
              type: 'asset.checked_out',
              title: `You borrowed ${asset.name}`,
              body: `${asset.code}${created.dueDate ? ` · return by ${created.dueDate}` : ''}`,
              link: `/c/${church.id}/facilities/inventory/${asset.id}`,
              entityType: 'inventory_asset',
              entityId: asset.id,
            });
          }
          return created;
        });
        set.status = 201;
        const [hydrated] = hydrateLoans(db, [loan], today(church));
        return { loan: hydrated };
      },
      {
        church: { module: 'facilities', permission: 'inventory.manage' },
        params: churchIdParamsSchema,
        body: checkOutAssetBodySchema,
      },
    )
    .post(
      '/loans/:id/return',
      ({ church, auth, audit, params, body }) => {
        const loan = loadLoan(db, church.id, params.id);
        if (loan.returnedAt) throw conflict('This loan was already returned');
        const asset = loadAsset(db, church.id, loan.assetId);
        const now = nowIso();
        const returned = db.transaction((tx) => {
          const next = tx
            .update(assetLoans)
            .set({
              returnedAt: now,
              conditionIn: body.conditionIn,
              notes: body.notes ?? loan.notes,
              returnedTo: auth.user.id,
              updatedAt: now,
            })
            .where(and(eq(assetLoans.id, loan.id), isNull(assetLoans.returnedAt)))
            .returning()
            .get();
          if (!next) throw conflict('This loan was already returned');
          // A broken item goes straight to maintenance instead of back on the shelf.
          tx.update(inventoryAssets)
            .set({
              status: body.conditionIn === 'broken' ? 'maintenance' : 'available',
              condition: body.conditionIn,
              updatedAt: now,
            })
            .where(eq(inventoryAssets.id, asset.id))
            .run();
          recordAudit(tx, audit, {
            module: 'facilities',
            action: 'asset.return',
            entityType: 'inventory_asset',
            entityId: asset.id,
            summary: `${loan.borrowerName} returned ${asset.code} ${asset.name}`,
            before: { condition: asset.condition, status: asset.status },
            after: {
              condition: body.conditionIn,
              status: body.conditionIn === 'broken' ? 'maintenance' : 'available',
            },
          });
          return next;
        });
        const [hydrated] = hydrateLoans(db, [returned], today(church));
        return { loan: hydrated };
      },
      {
        church: { module: 'facilities', permission: 'inventory.manage' },
        params: churchIdParamsSchema,
        body: returnAssetBodySchema,
      },
    )
    .get(
      '/loans',
      ({ church, query }) => {
        const conditions: SQL[] = [eq(assetLoans.churchId, church.id)];
        if (query.assetId) conditions.push(eq(assetLoans.assetId, query.assetId));
        if (query.scope === 'open') conditions.push(isNull(assetLoans.returnedAt));
        if (query.scope === 'returned') conditions.push(isNotNull(assetLoans.returnedAt));
        if (query.scope === 'overdue') {
          conditions.push(
            isNull(assetLoans.returnedAt),
            isNotNull(assetLoans.dueDate),
            lt(assetLoans.dueDate, today(church)),
          );
        }
        if (query.q) {
          const pattern = likePattern(query.q);
          const assetIds = db
            .select({ id: inventoryAssets.id })
            .from(inventoryAssets)
            .where(
              and(
                eq(inventoryAssets.churchId, church.id),
                or(like(inventoryAssets.name, pattern), like(inventoryAssets.code, pattern)),
              ),
            )
            .all()
            .map((row) => row.id);
          const match = or(
            like(assetLoans.borrowerName, pattern),
            assetIds.length > 0 ? inArray(assetLoans.assetId, assetIds) : undefined,
          );
          if (match) conditions.push(match);
        }
        const where = and(...conditions);
        const total = db.select({ value: count() }).from(assetLoans).where(where).get()?.value ?? 0;
        const order =
          query.scope === 'open' || query.scope === 'overdue'
            ? [
                asc(sql`coalesce(${assetLoans.dueDate}, '9999-12-31')`),
                asc(assetLoans.checkedOutAt),
              ]
            : query.scope === 'returned'
              ? [desc(assetLoans.returnedAt)]
              : [desc(assetLoans.checkedOutAt)];
        const rows = db
          .select()
          .from(assetLoans)
          .where(where)
          .orderBy(...order)
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: hydrateLoans(db, rows, today(church)),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      {
        church: { module: 'facilities', permission: VIEW },
        params: churchParamsSchema,
        query: assetLoanListQuerySchema,
      },
    )
    .post(
      '/assets/:id/maintenance',
      ({ church, auth, audit, params, body, set }) => {
        const asset = loadAsset(db, church.id, params.id);
        const entry = db.transaction((tx) => {
          const created = tx
            .insert(assetMaintenance)
            .values({
              id: newId(),
              churchId: church.id,
              assetId: asset.id,
              date: body.date,
              kind: body.kind,
              description: body.description,
              cost: body.cost,
              performedBy: body.performedBy,
              nextDueDate: body.nextDueDate,
              createdBy: auth.user.id,
              createdAt: nowIso(),
            })
            .returning()
            .get();
          tx.update(inventoryAssets)
            .set({ updatedAt: nowIso() })
            .where(eq(inventoryAssets.id, asset.id))
            .run();
          recordAudit(tx, audit, {
            module: 'facilities',
            action: 'asset.maintenance_log',
            entityType: 'inventory_asset',
            entityId: asset.id,
            summary: `Logged maintenance of ${asset.code} ${asset.name}`,
            after: { kind: created.kind, date: created.date, cost: created.cost },
          });
          return created;
        });
        set.status = 201;
        return { maintenance: toAssetMaintenance(entry, auth.user.name) };
      },
      {
        church: { module: 'facilities', permission: 'inventory.manage' },
        params: churchIdParamsSchema,
        body: assetMaintenanceInputSchema,
      },
    )
    .delete(
      '/maintenance/:id',
      ({ church, audit, params }) => {
        const entry = loadMaintenance(db, church.id, params.id);
        const asset = loadAsset(db, church.id, entry.assetId);
        db.transaction((tx) => {
          tx.delete(assetMaintenance).where(eq(assetMaintenance.id, entry.id)).run();
          recordAudit(tx, audit, {
            module: 'facilities',
            action: 'asset.maintenance_delete',
            entityType: 'inventory_asset',
            entityId: asset.id,
            summary: `Removed a maintenance entry of ${asset.code} ${asset.name}`,
            before: { kind: entry.kind, date: entry.date, cost: entry.cost },
          });
        });
        return { ok: true as const };
      },
      {
        church: { module: 'facilities', permission: 'inventory.manage' },
        params: churchIdParamsSchema,
      },
    );
};
