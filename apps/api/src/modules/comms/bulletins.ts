import {
  addDaysToDate,
  bulletinInputSchema,
  bulletinListQuerySchema,
  bulletinSourcesQuerySchema,
  canManageBulletins,
  churchIdParamsSchema,
  churchParamsSchema,
  type AccessLike,
  type Bulletin,
  type BulletinInput,
} from '@tatagereja/shared';
import { and, count, desc, eq, inArray, like, or, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { BulletinRow, ChurchRow } from '../../db/schema';
import { bulletins, users } from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { notify } from '../../services/notifications';
import { bulletinSources, renderBulletin, sectionsOf, weekWindow } from './bulletin-content';

const READ = ['bulletin.view', 'bulletin.manage'] as const;

const toBulletin = (row: BulletinRow, authorName: string | null): Bulletin => ({
  id: row.id,
  churchId: row.churchId,
  title: row.title,
  issueDate: row.issueDate,
  theme: row.theme,
  coverImageUrl: row.coverImageUrl,
  sections: sectionsOf(row),
  includeFinanceSummary: row.includeFinanceSummary,
  status: row.status,
  publishedAt: row.publishedAt,
  authorName,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const snapshot = (row: BulletinRow) => ({
  title: row.title,
  issueDate: row.issueDate,
  theme: row.theme,
  status: row.status,
  sectionCount: sectionsOf(row).length,
  includeFinanceSummary: row.includeFinanceSummary,
});

/** Stored form of the editor's input; the finance flag follows the presence of a finance section. */
const valuesOf = (body: BulletinInput) => ({
  title: body.title,
  issueDate: body.issueDate,
  theme: body.theme,
  coverImageUrl: body.coverImageUrl,
  sections: body.sections,
  includeFinanceSummary: body.sections.some((section) => section.kind === 'finance'),
});

/**
 * Warta Jemaat: weekly bulletins composed from free sections and generated ones
 * (announcements, services, rosters, events, birthdays, anniversaries, the offering summary),
 * drafted and published by `bulletin.manage`, read by every member with `bulletin.view`.
 */
export const bulletinsRouter = (deps: Deps) => {
  const { db } = deps;

  const authorNames = (rows: BulletinRow[]) => {
    const ids = [...new Set(rows.map((row) => row.createdBy).filter((id): id is string => !!id))];
    return new Map(
      ids.length > 0
        ? db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, ids))
            .all()
            .map((row) => [row.id, row.name])
        : [],
    );
  };

  const serialize = (row: BulletinRow) =>
    toBulletin(row, row.createdBy ? (authorNames([row]).get(row.createdBy) ?? null) : null);

  const loadBulletin = (churchId: string, id: string): BulletinRow => {
    const row = db
      .select()
      .from(bulletins)
      .where(and(eq(bulletins.id, id), eq(bulletins.churchId, churchId)))
      .get();
    if (!row) throw notFound('Bulletin');
    return row;
  };

  /** Drafts are invisible (404) to readers. */
  const loadReadable = (churchId: string, access: AccessLike, id: string): BulletinRow => {
    const row = loadBulletin(churchId, id);
    if (row.status !== 'published' && !canManageBulletins(access)) throw notFound('Bulletin');
    return row;
  };

  const detail = (church: ChurchRow, access: AccessLike, row: BulletinRow) => {
    const week = weekWindow(row.issueDate, church.timezone);
    return {
      bulletin: serialize(row),
      rendered: renderBulletin(db, church, access, row),
      week: { from: week.from, to: week.to },
      churchName: church.name,
      canManage: canManageBulletins(access),
    };
  };

  return new Elysia({ prefix: '/churches/:churchId/bulletins' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const conditions: (SQL | undefined)[] = [eq(bulletins.churchId, church.id)];
        if (!canManageBulletins(access)) conditions.push(eq(bulletins.status, 'published'));
        if (query.status) conditions.push(eq(bulletins.status, query.status));
        if (query.q) {
          conditions.push(
            or(
              like(bulletins.title, likePattern(query.q)),
              like(bulletins.theme, likePattern(query.q)),
            ),
          );
        }
        const where = and(...conditions);
        const total = db.select({ value: count() }).from(bulletins).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(bulletins)
          .where(where)
          .orderBy(desc(bulletins.issueDate), desc(bulletins.createdAt))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        const names = authorNames(rows);
        return {
          items: rows.map((row) => {
            const { sections, ...summary } = toBulletin(
              row,
              row.createdBy ? (names.get(row.createdBy) ?? null) : null,
            );
            return { ...summary, sectionCount: sections.length };
          }),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      {
        church: { permission: [...READ] },
        params: churchParamsSchema,
        query: bulletinListQuerySchema,
      },
    )
    .get(
      '/sources',
      ({ church, access, query }) => bulletinSources(db, church, access, query.issueDate),
      {
        church: { permission: 'bulletin.manage' },
        params: churchParamsSchema,
        query: bulletinSourcesQuerySchema,
      },
    )
    .post(
      '/',
      ({ church, auth, audit, body, set }) => {
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(bulletins)
            .values({
              id: newId(),
              churchId: church.id,
              ...valuesOf(body),
              status: 'draft',
              createdBy: auth.user.id,
              updatedBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'bulletin.create',
            entityType: 'bulletin',
            entityId: created.id,
            summary: `Drafted the bulletin ${created.title}`,
            after: snapshot(created),
          });
          return created;
        });
        set.status = 201;
        return { bulletin: serialize(row) };
      },
      {
        church: { permission: 'bulletin.manage' },
        params: churchParamsSchema,
        body: bulletinInputSchema,
      },
    )
    .get(
      '/:id',
      ({ church, access, params }) =>
        detail(church, access, loadReadable(church.id, access, params.id)),
      { church: { permission: [...READ] }, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, auth, audit, params, body }) => {
        const row = loadBulletin(church.id, params.id);
        const updated = db.transaction((tx) => {
          const next = tx
            .update(bulletins)
            .set({ ...valuesOf(body), updatedBy: auth.user.id, updatedAt: nowIso() })
            .where(eq(bulletins.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Bulletin');
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'bulletin.update',
            entityType: 'bulletin',
            entityId: row.id,
            summary: `Updated the bulletin ${next.title}`,
            ...changes(snapshot(row), snapshot(next)),
          });
          return next;
        });
        return { bulletin: serialize(updated) };
      },
      {
        church: { permission: 'bulletin.manage' },
        params: churchIdParamsSchema,
        body: bulletinInputSchema,
      },
    )
    .post(
      '/:id/publish',
      ({ church, auth, audit, params }) => {
        const row = loadBulletin(church.id, params.id);
        if (row.status === 'published') throw conflict('This bulletin is already published');
        const firstTime = row.publishedAt === null;
        const updated = db.transaction((tx) => {
          const now = nowIso();
          const next = tx
            .update(bulletins)
            .set({
              status: 'published',
              publishedAt: row.publishedAt ?? now,
              updatedBy: auth.user.id,
              updatedAt: now,
            })
            .where(eq(bulletins.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Bulletin');
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'bulletin.publish',
            entityType: 'bulletin',
            entityId: row.id,
            summary: `Published the bulletin ${next.title}`,
          });
          // Members hear about a bulletin once, not again after every correction.
          if (firstTime) {
            notify(tx, {
              churchId: church.id,
              audience: { kind: 'permission', permission: 'bulletin.view' },
              excludeUserIds: [auth.user.id],
              type: 'bulletin.published',
              title: next.title,
              body: next.theme ?? `Warta Jemaat ${next.issueDate}`,
              link: `/c/${church.id}/bulletins/${next.id}`,
              entityType: 'bulletin',
              entityId: next.id,
            });
          }
          return next;
        });
        return { bulletin: serialize(updated) };
      },
      { church: { permission: 'bulletin.manage' }, params: churchIdParamsSchema },
    )
    .post(
      '/:id/unpublish',
      ({ church, auth, audit, params }) => {
        const row = loadBulletin(church.id, params.id);
        if (row.status !== 'published') throw conflict('This bulletin is not published');
        const updated = db.transaction((tx) => {
          const next = tx
            .update(bulletins)
            .set({ status: 'draft', updatedBy: auth.user.id, updatedAt: nowIso() })
            .where(eq(bulletins.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Bulletin');
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'bulletin.unpublish',
            entityType: 'bulletin',
            entityId: row.id,
            summary: `Withdrew the bulletin ${next.title}`,
          });
          return next;
        });
        return { bulletin: serialize(updated) };
      },
      { church: { permission: 'bulletin.manage' }, params: churchIdParamsSchema },
    )
    .post(
      '/:id/duplicate',
      ({ church, auth, audit, params, set }) => {
        const row = loadBulletin(church.id, params.id);
        const now = nowIso();
        const copy = db.transaction((tx) => {
          const created = tx
            .insert(bulletins)
            .values({
              id: newId(),
              churchId: church.id,
              title: row.title,
              issueDate: addDaysToDate(row.issueDate, 7),
              theme: null,
              coverImageUrl: row.coverImageUrl,
              sections: sectionsOf(row).map((section) => ({
                ...section,
                id: newId().slice(0, 8),
                // Picked items belong to the old week; generated sections start fresh.
                itemIds: [],
              })),
              includeFinanceSummary: row.includeFinanceSummary,
              status: 'draft',
              createdBy: auth.user.id,
              updatedBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'bulletin.create',
            entityType: 'bulletin',
            entityId: created.id,
            summary: `Drafted the bulletin ${created.title} from ${row.issueDate}`,
            after: snapshot(created),
          });
          return created;
        });
        set.status = 201;
        return { bulletin: serialize(copy) };
      },
      { church: { permission: 'bulletin.manage' }, params: churchIdParamsSchema },
    )
    .delete(
      '/:id',
      ({ church, audit, params }) => {
        const row = loadBulletin(church.id, params.id);
        db.transaction((tx) => {
          tx.delete(bulletins).where(eq(bulletins.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'bulletin.delete',
            entityType: 'bulletin',
            entityId: row.id,
            summary: `Deleted the bulletin ${row.title}`,
            before: snapshot(row),
          });
        });
        return { ok: true as const };
      },
      { church: { permission: 'bulletin.manage' }, params: churchIdParamsSchema },
    );
};
