import {
  CONTRIBUTION_KINDS,
  CONTRIBUTION_KIND_CATEGORY,
  CONTRIBUTION_KIND_LABELS,
  LIMITS,
  canCorrectContribution,
  canViewGivingOf,
  churchIdParamsSchema,
  churchParamsSchema,
  financeContributionInputSchema,
  financeContributionListQuerySchema,
  fullName,
  givingStatementListQuerySchema,
  givingStatementParamsSchema,
  givingStatementQuerySchema,
  has,
  localize,
  voidFinanceBodySchema,
  type FinanceContributionInput,
  type GivingStatement,
} from '@tatagereja/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  like,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow, FinanceContributionRow } from '../../db/schema';
import {
  financeCampaigns,
  financeCategories,
  financeContributions,
  financePledges,
  people,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { toPersonSummary } from '../../serializers';
import { changes, recordAudit } from '../../services/audit';
import {
  assertPeriodOpen,
  csvHeaders,
  enforceExportLimit,
  loadPersonInChurch,
  loadPostingTargets,
  nextReceiptNumber,
  postEntry,
  sumOf,
  toCsv,
  voidEntriesOf,
} from '../../services/finance';
import { hydrateContributions, hydratePledges } from './serializers';

const live = isNull(financeContributions.voidedAt);

/** One person's giving in a year: totals per kind and fund, every gift and their pledges. */
export function givingStatement(
  db: Queryable,
  church: ChurchRow,
  personId: string,
  year: number,
): GivingStatement {
  const person = loadPersonInChurch(db, church.id, personId);
  const rows = db
    .select()
    .from(financeContributions)
    .where(
      and(
        eq(financeContributions.churchId, church.id),
        eq(financeContributions.personId, person.id),
        live,
        gte(financeContributions.receivedAt, `${year}-01-01`),
        lte(financeContributions.receivedAt, `${year}-12-31`),
      ),
    )
    .orderBy(asc(financeContributions.receivedAt), asc(financeContributions.createdAt))
    .all();
  const items = hydrateContributions(db, church.id, rows);
  const byKind = CONTRIBUTION_KINDS.map((kind) => ({
    kind,
    amount: items.filter((item) => item.kind === kind).reduce((sum, item) => sum + item.amount, 0),
  })).filter((item) => item.amount > 0);
  const funds = new Map<string, number>();
  for (const item of items) funds.set(item.fundName, (funds.get(item.fundName) ?? 0) + item.amount);
  const pledges = hydratePledges(
    db,
    church.id,
    db
      .select()
      .from(financePledges)
      .where(and(eq(financePledges.churchId, church.id), eq(financePledges.personId, person.id)))
      .orderBy(desc(financePledges.createdAt))
      .all(),
  );
  return {
    year,
    person: toPersonSummary(person),
    currency: church.currency,
    total: items.reduce((sum, item) => sum + item.amount, 0),
    byKind,
    byFund: [...funds].map(([fundName, amount]) => ({ fundName, amount })),
    items: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      fundName: item.fundName,
      method: item.method,
      amount: item.amount,
      receivedAt: item.receivedAt,
      receiptNumber: item.receiptNumber,
    })),
    pledges: pledges.map((pledge) => ({
      id: pledge.id,
      campaignId: pledge.campaignId,
      campaignName: pledge.campaignName,
      amount: pledge.amount,
      paidAmount: pledge.paidAmount,
    })),
  };
}

export const contributionsRouter = (deps: Deps) => {
  const { db } = deps;

  const loadContribution = (churchId: string, id: string): FinanceContributionRow => {
    const row = db
      .select()
      .from(financeContributions)
      .where(and(eq(financeContributions.id, id), eq(financeContributions.churchId, churchId)))
      .get();
    if (!row) throw notFound('Contribution');
    return row;
  };

  const hydrateOne = (churchId: string, row: FinanceContributionRow) => {
    const [contribution] = hydrateContributions(db, churchId, [row]);
    if (!contribution) throw notFound('Contribution');
    return contribution;
  };

  /** Checks every reference and fills in the suggested category of the kind. */
  const resolve = (
    churchId: string,
    body: FinanceContributionInput,
    current?: FinanceContributionRow,
  ) => {
    const targets = loadPostingTargets(db, churchId, body, 'income', current);
    const person = body.personId ? loadPersonInChurch(db, churchId, body.personId) : null;
    if (body.campaignId) {
      const campaign = db
        .select()
        .from(financeCampaigns)
        .where(
          and(eq(financeCampaigns.id, body.campaignId), eq(financeCampaigns.churchId, churchId)),
        )
        .get();
      if (!campaign) throw notFound('Campaign');
      // A correction may keep the campaign it was given to after the campaign closed.
      if (campaign.status !== 'active' && campaign.id !== current?.campaignId) {
        throw badRequest(`The campaign ${campaign.name} is closed`);
      }
    }
    let categoryId = body.categoryId;
    const suggested = CONTRIBUTION_KIND_CATEGORY[body.kind];
    if (!categoryId && suggested) {
      categoryId =
        db
          .select({ id: financeCategories.id })
          .from(financeCategories)
          .where(
            and(
              eq(financeCategories.churchId, churchId),
              eq(financeCategories.kind, 'income'),
              eq(financeCategories.isActive, true),
              eq(financeCategories.name, suggested),
            ),
          )
          .get()?.id ?? null;
    }
    const donor = person ? fullName(person) : (body.donorName ?? 'NN');
    return { ...targets, person, categoryId, donor };
  };

  const postFor = (
    tx: Queryable,
    churchId: string,
    row: FinanceContributionRow,
    donor: string,
    userId: string,
  ) =>
    postEntry(tx, {
      churchId,
      entryDate: row.receivedAt,
      accountId: row.accountId,
      fundId: row.fundId,
      categoryId: row.categoryId,
      amount: row.amount,
      description: `${localize(CONTRIBUTION_KIND_LABELS[row.kind], 'id')} · ${donor}${row.receiptNumber ? ` (${row.receiptNumber})` : ''}`,
      sourceType: 'contribution',
      sourceId: row.id,
      createdBy: userId,
    });

  const auditable = (row: FinanceContributionRow) => ({
    personId: row.personId,
    donorName: row.donorName,
    kind: row.kind,
    fundId: row.fundId,
    accountId: row.accountId,
    categoryId: row.categoryId,
    campaignId: row.campaignId,
    method: row.method,
    amount: row.amount,
    receivedAt: row.receivedAt,
    reference: row.reference,
    note: row.note,
  });

  return (
    new Elysia({ prefix: '/churches/:churchId/finance' })
      .use(authPlugin(deps))
      .get(
        '/contributions',
        ({ church, access, query }) => {
          const conditions: SQL[] = [eq(financeContributions.churchId, church.id)];
          // Recorders without `finance.view` review only the gifts they recorded themselves.
          if (!has(access, 'finance.view')) {
            conditions.push(eq(financeContributions.recordedBy, access.userId));
          }
          if (!query.includeVoided) conditions.push(live);
          if (query.personId) conditions.push(eq(financeContributions.personId, query.personId));
          if (query.kind) conditions.push(eq(financeContributions.kind, query.kind));
          if (query.fundId) conditions.push(eq(financeContributions.fundId, query.fundId));
          if (query.campaignId)
            conditions.push(eq(financeContributions.campaignId, query.campaignId));
          if (query.method) conditions.push(eq(financeContributions.method, query.method));
          if (query.from) conditions.push(gte(financeContributions.receivedAt, query.from));
          if (query.to) conditions.push(lte(financeContributions.receivedAt, query.to));
          if (query.q) {
            const pattern = likePattern(query.q);
            const match = or(
              like(financeContributions.donorName, pattern),
              like(financeContributions.receiptNumber, pattern),
              like(financeContributions.reference, pattern),
              like(people.firstName, pattern),
              like(people.lastName, pattern),
              like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
            );
            if (match) conditions.push(match);
          }
          const where = and(...conditions);
          // People are joined only to search their names; without a search the count and
          // total come from the covering index alone.
          const base = () => {
            const select = db
              .select({ row: financeContributions })
              .from(financeContributions)
              .$dynamic();
            return (
              query.q
                ? select.leftJoin(people, eq(people.id, financeContributions.personId))
                : select
            ).where(where);
          };
          const totalsQuery = db
            .select({
              value: count(),
              amount: sumOf(
                sql`case when ${financeContributions.voidedAt} is null then ${financeContributions.amount} else 0 end`,
              ),
            })
            .from(financeContributions)
            .$dynamic();
          const totals = (
            query.q
              ? totalsQuery.leftJoin(people, eq(people.id, financeContributions.personId))
              : totalsQuery
          )
            .where(where)
            .get();
          const order = {
            receivedAt: [asc(financeContributions.receivedAt), asc(financeContributions.createdAt)],
            '-receivedAt': [
              desc(financeContributions.receivedAt),
              desc(financeContributions.createdAt),
            ],
            amount: [asc(financeContributions.amount)],
            '-amount': [desc(financeContributions.amount)],
          }[query.sort];
          const rows = base()
            .orderBy(...order)
            .limit(query.limit)
            .offset(offsetOf(query))
            .all()
            .map((item) => item.row);
          return {
            items: hydrateContributions(db, church.id, rows),
            total: totals?.value ?? 0,
            totalAmount: totals?.amount ?? 0,
            page: query.page,
            limit: query.limit,
          };
        },
        {
          church: { module: 'finance', permission: ['finance.view', 'finance.record'] },
          params: churchParamsSchema,
          query: financeContributionListQuerySchema,
        },
      )
      .post(
        '/contributions',
        ({ church, auth, audit, body, set }) => {
          const resolved = resolve(church.id, body);
          assertPeriodOpen(db, church.id, body.receivedAt);
          const now = nowIso();
          const row = db.transaction((tx) => {
            const inserted = tx
              .insert(financeContributions)
              .values({
                id: newId(),
                churchId: church.id,
                personId: body.personId,
                donorName: body.personId ? null : body.donorName,
                kind: body.kind,
                fundId: body.fundId,
                accountId: body.accountId,
                categoryId: resolved.categoryId,
                campaignId: body.campaignId,
                method: body.method,
                amount: body.amount,
                receivedAt: body.receivedAt,
                reference: body.reference,
                receiptNumber: nextReceiptNumber(tx, church.id, body.receivedAt),
                note: body.note,
                recordedBy: auth.user.id,
                createdAt: now,
                updatedAt: now,
              })
              .returning()
              .get();
            postFor(tx, church.id, inserted, resolved.donor, auth.user.id);
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'contribution.create',
              entityType: 'finance_contribution',
              entityId: inserted.id,
              summary: `Recorded ${localize(CONTRIBUTION_KIND_LABELS[inserted.kind], 'en').toLowerCase()} ${inserted.receiptNumber} from ${resolved.donor}`,
              after: auditable(inserted),
            });
            return inserted;
          });
          set.status = 201;
          return { contribution: hydrateOne(church.id, row) };
        },
        {
          church: { module: 'finance', permission: 'finance.record' },
          params: churchParamsSchema,
          body: financeContributionInputSchema,
        },
      )
      .get(
        '/contributions/:id',
        ({ church, access, params }) => {
          const row = loadContribution(church.id, params.id);
          // A receipt: finance viewers, the giver themselves, or whoever recorded it.
          const own = !!row.personId && row.personId === access.personId;
          const recorded = row.recordedBy === access.userId && has(access, 'finance.record');
          if (!has(access, 'finance.view') && !own && !recorded) throw notFound('Contribution');
          return { contribution: hydrateOne(church.id, row) };
        },
        { church: 'finance', params: churchIdParamsSchema },
      )
      .patch(
        '/contributions/:id',
        ({ church, access, auth, audit, params, body }) => {
          const current = loadContribution(church.id, params.id);
          if (current.voidedAt) throw conflict('A voided contribution cannot be corrected');
          if (!canCorrectContribution(access, current)) {
            throw forbidden(
              'Only the person who recorded this gift or a finance manager can correct it',
            );
          }
          const resolved = resolve(church.id, body, current);
          assertPeriodOpen(db, church.id, current.receivedAt, body.receivedAt);
          const row = db.transaction((tx) => {
            const updated = tx
              .update(financeContributions)
              .set({
                personId: body.personId,
                donorName: body.personId ? null : body.donorName,
                kind: body.kind,
                fundId: body.fundId,
                accountId: body.accountId,
                categoryId: resolved.categoryId,
                campaignId: body.campaignId,
                method: body.method,
                amount: body.amount,
                receivedAt: body.receivedAt,
                reference: body.reference,
                note: body.note,
                updatedAt: nowIso(),
              })
              .where(eq(financeContributions.id, current.id))
              .returning()
              .get();
            if (!updated) throw notFound('Contribution');
            // The ledger keeps the original line, voided, next to the corrected one.
            voidEntriesOf(
              tx,
              church.id,
              { type: 'contribution', id: current.id },
              auth.user.id,
              'Corrected',
            );
            postFor(tx, church.id, updated, resolved.donor, auth.user.id);
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'contribution.update',
              entityType: 'finance_contribution',
              entityId: current.id,
              summary: `Corrected contribution ${current.receiptNumber ?? current.id}`,
              ...changes(auditable(current), auditable(updated)),
            });
            return updated;
          });
          return { contribution: hydrateOne(church.id, row) };
        },
        {
          church: { module: 'finance', permission: ['finance.record', 'finance.manage'] },
          params: churchIdParamsSchema,
          body: financeContributionInputSchema,
        },
      )
      .post(
        '/contributions/:id/void',
        ({ church, auth, audit, params, body }) => {
          const current = loadContribution(church.id, params.id);
          if (current.voidedAt) throw conflict('This contribution is already voided');
          assertPeriodOpen(db, church.id, current.receivedAt);
          const row = db.transaction((tx) => {
            const updated = tx
              .update(financeContributions)
              .set({
                voidedAt: nowIso(),
                voidedBy: auth.user.id,
                voidReason: body.reason,
                updatedAt: nowIso(),
              })
              .where(eq(financeContributions.id, current.id))
              .returning()
              .get();
            if (!updated) throw notFound('Contribution');
            voidEntriesOf(
              tx,
              church.id,
              { type: 'contribution', id: current.id },
              auth.user.id,
              body.reason,
            );
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'contribution.void',
              entityType: 'finance_contribution',
              entityId: current.id,
              summary: `Voided contribution ${current.receiptNumber ?? current.id}`,
              before: { amount: current.amount, voidedAt: null },
              after: {
                amount: current.amount,
                voidedAt: updated.voidedAt,
                voidReason: body.reason,
              },
            });
            return updated;
          });
          return { contribution: hydrateOne(church.id, row) };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchIdParamsSchema,
          body: voidFinanceBodySchema,
        },
      )
      // ---- Giving statements -----------------------------------------------------------------
      .get(
        '/my-giving',
        ({ church, access, query }) => ({
          statement: access.personId
            ? givingStatement(db, church, access.personId, query.year)
            : null,
        }),
        { church: 'finance', params: churchParamsSchema, query: givingStatementQuerySchema },
      )
      .get(
        '/giving-statements',
        ({ church, auth, query, set }) => {
          const range = and(
            eq(financeContributions.churchId, church.id),
            live,
            gte(financeContributions.receivedAt, `${query.year}-01-01`),
            lte(financeContributions.receivedAt, `${query.year}-12-31`),
          );
          const conditions: SQL[] = [isNotNull(financeContributions.personId)];
          if (query.q) {
            const pattern = likePattern(query.q);
            const match = or(
              like(people.firstName, pattern),
              like(people.lastName, pattern),
              like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
            );
            if (match) conditions.push(match);
          }
          const where = and(range, ...conditions);
          const grouped = db
            .select({
              person: people,
              total: sumOf(financeContributions.amount),
              count: count(),
              lastGiftAt: sql<string | null>`max(${financeContributions.receivedAt})`,
            })
            .from(financeContributions)
            .innerJoin(people, eq(people.id, financeContributions.personId))
            .where(where)
            .groupBy(people.id)
            .orderBy(asc(people.firstName), asc(people.lastName));
          const toItem = (row: {
            person: typeof people.$inferSelect;
            total: number;
            count: number;
            lastGiftAt: string | null;
          }) => ({
            person: toPersonSummary(row.person),
            total: row.total,
            count: row.count,
            lastGiftAt: row.lastGiftAt,
          });
          if (query.format === 'csv') {
            enforceExportLimit(deps.limiters, church.id, auth.user.id);
            Object.assign(set.headers, csvHeaders(`rekap-persembahan-${query.year}.csv`));
            return toCsv([
              ['Nama', 'Jumlah pemberian', 'Total', 'Terakhir'],
              ...grouped
                .limit(LIMITS.csvRowsMax)
                .all()
                .map((row) => [fullName(row.person), row.count, row.total, row.lastGiftAt]),
            ]);
          }
          const total =
            db
              .select({
                value: sql<number>`count(distinct ${financeContributions.personId})`.mapWith(
                  Number,
                ),
              })
              .from(financeContributions)
              .innerJoin(people, eq(people.id, financeContributions.personId))
              .where(where)
              .get()?.value ?? 0;
          const anonymousTotal =
            db
              .select({ value: sumOf(financeContributions.amount) })
              .from(financeContributions)
              .where(and(range, isNull(financeContributions.personId)))
              .get()?.value ?? 0;
          return {
            year: query.year,
            items: grouped.limit(query.limit).offset(offsetOf(query)).all().map(toItem),
            total,
            page: query.page,
            limit: query.limit,
            anonymousTotal,
          };
        },
        {
          church: { module: 'finance', permission: 'finance.reports' },
          params: churchParamsSchema,
          query: givingStatementListQuerySchema,
        },
      )
      .get(
        '/giving-statements/:personId',
        ({ church, access, params, query }) => {
          if (!canViewGivingOf(access, params.personId)) {
            throw forbidden('You cannot see the giving of this person');
          }
          return { statement: givingStatement(db, church, params.personId, query.year) };
        },
        {
          church: 'finance',
          params: givingStatementParamsSchema,
          query: givingStatementQuerySchema,
        },
      )
  );
};
