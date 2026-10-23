import {
  churchIdParamsSchema,
  churchParamsSchema,
  financeBudgetQuerySchema,
  financeCampaignInputSchema,
  financeCampaignListQuerySchema,
  financePledgeInputSchema,
  financePledgeParamsSchema,
  saveBudgetBodySchema,
  type FinanceBudget,
  type FinanceBudgetList,
} from '@tatagereja/shared';
import { and, asc, desc, eq, gte, isNotNull, lte, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { FinanceCampaignRow, FinancePledgeRow } from '../../db/schema';
import {
  financeBudgets,
  financeCampaigns,
  financeCategories,
  financeContributions,
  financeEntries,
  financePledges,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, notFound } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import {
  liveEntry,
  loadCategory,
  loadFund,
  loadPersonInChurch,
  sumOf,
} from '../../services/finance';
import { hydrateCampaigns, hydratePledges } from './serializers';

/** The RAPB of a year: every category with its budget, actual and variance. */
export function budgetOf(db: Queryable, churchId: string, year: number): FinanceBudgetList {
  const budgets = new Map(
    db
      .select()
      .from(financeBudgets)
      .where(and(eq(financeBudgets.churchId, churchId), eq(financeBudgets.year, year)))
      .all()
      .map((row) => [row.categoryId, row]),
  );
  const actuals = new Map(
    db
      .select({ categoryId: financeEntries.categoryId, total: sumOf(financeEntries.amount) })
      .from(financeEntries)
      .where(
        and(
          eq(financeEntries.churchId, churchId),
          liveEntry,
          isNotNull(financeEntries.categoryId),
          gte(financeEntries.entryDate, `${year}-01-01`),
          lte(financeEntries.entryDate, `${year}-12-31`),
        ),
      )
      .groupBy(financeEntries.categoryId)
      .all()
      .map((row) => [row.categoryId ?? '', row.total]),
  );
  const categories = db
    .select()
    .from(financeCategories)
    .where(eq(financeCategories.churchId, churchId))
    .orderBy(
      asc(financeCategories.kind),
      asc(financeCategories.sortOrder),
      asc(financeCategories.name),
    )
    .all()
    .filter(
      (category) => category.isActive || budgets.has(category.id) || actuals.has(category.id),
    );
  const items: FinanceBudget[] = categories.map((category) => {
    const budget = budgets.get(category.id);
    const net = actuals.get(category.id) ?? 0;
    const actual = Math.max(0, category.kind === 'income' ? net : -net);
    const amount = budget?.amount ?? 0;
    return {
      id: budget?.id ?? null,
      year,
      categoryId: category.id,
      categoryName: category.name,
      kind: category.kind,
      amount,
      actual,
      variance: actual - amount,
      notes: budget?.notes ?? null,
    };
  });
  const total = (kind: 'income' | 'expense') => ({
    budget: items.filter((item) => item.kind === kind).reduce((sum, item) => sum + item.amount, 0),
    actual: items.filter((item) => item.kind === kind).reduce((sum, item) => sum + item.actual, 0),
  });
  return { year, items, totals: { income: total('income'), expense: total('expense') } };
}

const campaignAuditable = (row: FinanceCampaignRow) => ({
  name: row.name,
  description: row.description,
  fundId: row.fundId,
  targetAmount: row.targetAmount,
  startDate: row.startDate,
  endDate: row.endDate,
  status: row.status,
});

const pledgeAuditable = (row: FinancePledgeRow) => ({
  personId: row.personId,
  donorName: row.donorName,
  amount: row.amount,
  note: row.note,
});

export const budgetsRouter = (deps: Deps) => {
  const { db } = deps;

  const loadCampaign = (churchId: string, id: string): FinanceCampaignRow => {
    const row = db
      .select()
      .from(financeCampaigns)
      .where(and(eq(financeCampaigns.id, id), eq(financeCampaigns.churchId, churchId)))
      .get();
    if (!row) throw notFound('Campaign');
    return row;
  };

  const loadPledge = (churchId: string, campaignId: string, id: string): FinancePledgeRow => {
    const row = db
      .select()
      .from(financePledges)
      .where(
        and(
          eq(financePledges.id, id),
          eq(financePledges.churchId, churchId),
          eq(financePledges.campaignId, campaignId),
        ),
      )
      .get();
    if (!row) throw notFound('Pledge');
    return row;
  };

  const campaignDetail = (churchId: string, row: FinanceCampaignRow) => {
    const [campaign] = hydrateCampaigns(db, churchId, [row]);
    if (!campaign) throw notFound('Campaign');
    const pledges = hydratePledges(
      db,
      churchId,
      db
        .select()
        .from(financePledges)
        .where(and(eq(financePledges.churchId, churchId), eq(financePledges.campaignId, row.id)))
        .orderBy(desc(financePledges.amount))
        .all(),
    );
    return { campaign, pledges };
  };

  return (
    new Elysia({ prefix: '/churches/:churchId/finance' })
      .use(authPlugin(deps))
      .get('/budgets', ({ church, query }) => budgetOf(db, church.id, query.year), {
        church: { module: 'finance', permission: ['finance.view', 'finance.reports'] },
        params: churchParamsSchema,
        query: financeBudgetQuerySchema,
      })
      .put(
        '/budgets',
        ({ church, audit, body }) => {
          for (const item of body.items) loadCategory(db, church.id, item.categoryId);
          db.transaction((tx) => {
            const existing = new Map(
              tx
                .select()
                .from(financeBudgets)
                .where(
                  and(eq(financeBudgets.churchId, church.id), eq(financeBudgets.year, body.year)),
                )
                .all()
                .map((row) => [row.categoryId, row]),
            );
            const before: Record<string, number> = {};
            const after: Record<string, number> = {};
            const now = nowIso();
            for (const item of body.items) {
              const current = existing.get(item.categoryId);
              if (item.amount === 0 && !item.notes) {
                if (current) {
                  tx.delete(financeBudgets).where(eq(financeBudgets.id, current.id)).run();
                  before[item.categoryId] = current.amount;
                  after[item.categoryId] = 0;
                }
                continue;
              }
              if (current) {
                if (current.amount === item.amount && current.notes === item.notes) continue;
                tx.update(financeBudgets)
                  .set({ amount: item.amount, notes: item.notes, updatedAt: now })
                  .where(eq(financeBudgets.id, current.id))
                  .run();
                before[item.categoryId] = current.amount;
              } else {
                tx.insert(financeBudgets)
                  .values({
                    id: newId(),
                    churchId: church.id,
                    year: body.year,
                    categoryId: item.categoryId,
                    amount: item.amount,
                    notes: item.notes,
                    createdAt: now,
                    updatedAt: now,
                  })
                  .run();
                before[item.categoryId] = 0;
              }
              after[item.categoryId] = item.amount;
            }
            if (Object.keys(after).length > 0) {
              recordAudit(tx, audit, {
                module: 'finance',
                action: 'budget.update',
                entityType: 'finance_budget',
                entityId: String(body.year),
                summary: `Updated the ${body.year} budget (RAPB)`,
                before,
                after,
              });
            }
          });
          return budgetOf(db, church.id, body.year);
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchParamsSchema,
          body: saveBudgetBodySchema,
        },
      )
      // ---- Campaigns and pledges -------------------------------------------------------------
      .get(
        '/campaigns',
        ({ church, query }) => {
          const conditions: SQL[] = [eq(financeCampaigns.churchId, church.id)];
          if (query.status) conditions.push(eq(financeCampaigns.status, query.status));
          const rows = db
            .select()
            .from(financeCampaigns)
            .where(and(...conditions))
            .orderBy(asc(financeCampaigns.status), desc(financeCampaigns.startDate))
            .all();
          return { items: hydrateCampaigns(db, church.id, rows) };
        },
        {
          church: {
            module: 'finance',
            permission: ['finance.view', 'finance.record', 'finance.reports'],
          },
          params: churchParamsSchema,
          query: financeCampaignListQuerySchema,
        },
      )
      .post(
        '/campaigns',
        ({ church, audit, body, set }) => {
          loadFund(db, church.id, body.fundId);
          const now = nowIso();
          const row = db.transaction((tx) => {
            const inserted = tx
              .insert(financeCampaigns)
              .values({ id: newId(), churchId: church.id, ...body, createdAt: now, updatedAt: now })
              .returning()
              .get();
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'campaign.create',
              entityType: 'finance_campaign',
              entityId: inserted.id,
              summary: `Started the campaign ${inserted.name}`,
              after: campaignAuditable(inserted),
            });
            return inserted;
          });
          set.status = 201;
          return { campaign: campaignDetail(church.id, row).campaign };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchParamsSchema,
          body: financeCampaignInputSchema,
        },
      )
      .get(
        '/campaigns/:id',
        ({ church, params }) => campaignDetail(church.id, loadCampaign(church.id, params.id)),
        {
          church: {
            module: 'finance',
            permission: ['finance.view', 'finance.record', 'finance.reports'],
          },
          params: churchIdParamsSchema,
        },
      )
      .patch(
        '/campaigns/:id',
        ({ church, audit, params, body }) => {
          const campaign = loadCampaign(church.id, params.id);
          loadFund(db, church.id, body.fundId);
          const row = db.transaction((tx) => {
            const updated = tx
              .update(financeCampaigns)
              .set({ ...body, updatedAt: nowIso() })
              .where(eq(financeCampaigns.id, campaign.id))
              .returning()
              .get();
            if (!updated) throw notFound('Campaign');
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'campaign.update',
              entityType: 'finance_campaign',
              entityId: campaign.id,
              summary: `Updated the campaign ${updated.name}`,
              ...changes(campaignAuditable(campaign), campaignAuditable(updated)),
            });
            return updated;
          });
          return { campaign: campaignDetail(church.id, row).campaign };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchIdParamsSchema,
          body: financeCampaignInputSchema,
        },
      )
      .delete(
        '/campaigns/:id',
        ({ church, audit, params }) => {
          const campaign = loadCampaign(church.id, params.id);
          const given = db
            .select({ id: financeContributions.id })
            .from(financeContributions)
            .where(
              and(
                eq(financeContributions.churchId, church.id),
                eq(financeContributions.campaignId, campaign.id),
              ),
            )
            .limit(1)
            .get();
          if (given) {
            throw conflict(
              'This campaign has received contributions. Close it instead of deleting it.',
            );
          }
          db.transaction((tx) => {
            tx.delete(financeCampaigns).where(eq(financeCampaigns.id, campaign.id)).run();
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'campaign.delete',
              entityType: 'finance_campaign',
              entityId: campaign.id,
              summary: `Deleted the campaign ${campaign.name}`,
              before: campaignAuditable(campaign),
            });
          });
          return { ok: true as const };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchIdParamsSchema,
        },
      )
      .post(
        '/campaigns/:id/pledges',
        ({ church, auth, audit, params, body, set }) => {
          const campaign = loadCampaign(church.id, params.id);
          const person = body.personId ? loadPersonInChurch(db, church.id, body.personId) : null;
          if (person) {
            const duplicate = db
              .select({ id: financePledges.id })
              .from(financePledges)
              .where(
                and(
                  eq(financePledges.campaignId, campaign.id),
                  eq(financePledges.personId, person.id),
                ),
              )
              .get();
            if (duplicate) throw conflict('This person already has a pledge for the campaign');
          }
          const now = nowIso();
          const row = db.transaction((tx) => {
            const inserted = tx
              .insert(financePledges)
              .values({
                id: newId(),
                churchId: church.id,
                campaignId: campaign.id,
                personId: person?.id ?? null,
                donorName: person ? null : body.donorName,
                amount: body.amount,
                note: body.note,
                createdBy: auth.user.id,
                createdAt: now,
                updatedAt: now,
              })
              .returning()
              .get();
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'pledge.create',
              entityType: 'finance_pledge',
              entityId: inserted.id,
              summary: `Recorded a pledge for ${campaign.name}`,
              after: pledgeAuditable(inserted),
            });
            return inserted;
          });
          set.status = 201;
          const [pledge] = hydratePledges(db, church.id, [row]);
          return { pledge };
        },
        {
          church: { module: 'finance', permission: 'finance.record' },
          params: churchIdParamsSchema,
          body: financePledgeInputSchema,
        },
      )
      .patch(
        '/campaigns/:id/pledges/:pledgeId',
        ({ church, audit, params, body }) => {
          const campaign = loadCampaign(church.id, params.id);
          const pledge = loadPledge(church.id, campaign.id, params.pledgeId);
          const person = body.personId ? loadPersonInChurch(db, church.id, body.personId) : null;
          if (person && person.id !== pledge.personId) {
            const duplicate = db
              .select({ id: financePledges.id })
              .from(financePledges)
              .where(
                and(
                  eq(financePledges.campaignId, campaign.id),
                  eq(financePledges.personId, person.id),
                ),
              )
              .get();
            if (duplicate) throw conflict('This person already has a pledge for the campaign');
          }
          const row = db.transaction((tx) => {
            const updated = tx
              .update(financePledges)
              .set({
                personId: person?.id ?? null,
                donorName: person ? null : body.donorName,
                amount: body.amount,
                note: body.note,
                updatedAt: nowIso(),
              })
              .where(eq(financePledges.id, pledge.id))
              .returning()
              .get();
            if (!updated) throw notFound('Pledge');
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'pledge.update',
              entityType: 'finance_pledge',
              entityId: pledge.id,
              summary: `Updated a pledge for ${campaign.name}`,
              ...changes(pledgeAuditable(pledge), pledgeAuditable(updated)),
            });
            return updated;
          });
          const [hydrated] = hydratePledges(db, church.id, [row]);
          return { pledge: hydrated };
        },
        {
          church: { module: 'finance', permission: 'finance.record' },
          params: financePledgeParamsSchema,
          body: financePledgeInputSchema,
        },
      )
      .delete(
        '/campaigns/:id/pledges/:pledgeId',
        ({ church, audit, params }) => {
          const campaign = loadCampaign(church.id, params.id);
          const pledge = loadPledge(church.id, campaign.id, params.pledgeId);
          db.transaction((tx) => {
            tx.delete(financePledges).where(eq(financePledges.id, pledge.id)).run();
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'pledge.delete',
              entityType: 'finance_pledge',
              entityId: pledge.id,
              summary: `Removed a pledge for ${campaign.name}`,
              before: pledgeAuditable(pledge),
            });
          });
          return { ok: true as const };
        },
        {
          church: { module: 'finance', permission: 'finance.record' },
          params: financePledgeParamsSchema,
        },
      )
  );
};
