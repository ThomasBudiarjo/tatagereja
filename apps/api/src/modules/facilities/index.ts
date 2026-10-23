import {
  canManageFacilities,
  canViewFacilities,
  canViewInventory,
  churchParamsSchema,
  facilitiesPeopleQuerySchema,
  type FacilitiesOverview,
} from '@tatagereja/shared';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  notInArray,
  or,
  sql,
  sum,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import {
  assetLoans,
  facilityBookings,
  facilityResources,
  inventoryAssets,
  people,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { likePattern } from '../../lib/query';
import { authPlugin } from '../../plugins/auth';
import { toPersonSummary } from '../../serializers';
import {
  dateIn,
  expandOccurrences,
  hydrateBookings,
  hydrateLoans,
  hydrateResources,
  intersectsWindow,
  nextMaintenanceDates,
  startOfDayIn,
} from '../../services/facilities';
import { moduleStatus } from '../../services/modules';
import { bookingsRouter } from './bookings';
import { inventoryRouter } from './inventory';
import { resourcesRouter } from './resources';

const DAY_MS = 86_400_000;
const FAR_FUTURE = '9999-12-31T00:00:00.000Z';
/** Maintenance due within this many days counts as "due" on the overview. */
const MAINTENANCE_SOON_DAYS = 14;
const MY_UPCOMING_MAX = 5;
const OVERDUE_SHOWN = 5;
const PEOPLE_MAX = 20;

const ANY_FACILITIES_PERMISSION = [
  'facilities.view',
  'facilities.book',
  'facilities.manage',
  'inventory.view',
  'inventory.manage',
] as const;

/**
 * `status` is the wiring check (200 with the caller's facilities permissions, or 403
 * MODULE_DISABLED); `overview` feeds the module home; `people` is the person search used to
 * pick custodians and borrowers by people who may not browse the directory.
 */
const facilitiesHomeRouter = (deps: Deps) => {
  const { db } = deps;
  return new Elysia({ prefix: '/churches/:churchId/facilities' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'facilities'), {
      church: 'facilities',
      params: churchParamsSchema,
    })
    .get(
      '/overview',
      ({ church, access }): FacilitiesOverview => {
        const now = Date.now();
        const nowIso = new Date(now).toISOString();
        const today = dateIn(church.timezone);
        const manager = canManageFacilities(access);
        const overview: FacilitiesOverview = {
          resources: { total: 0, availableNow: 0 },
          pendingCount: 0,
          today: [],
          myUpcoming: [],
          inventory: null,
        };

        if (canViewFacilities(access)) {
          const rows = db
            .select()
            .from(facilityResources)
            .where(
              and(eq(facilityResources.churchId, church.id), eq(facilityResources.isActive, true)),
            )
            .all();
          const hydrated = hydrateResources(db, church.id, rows, now);
          overview.resources = {
            total: rows.length,
            availableNow: hydrated.filter((item) => item.availableNow).length,
          };
          const pending: SQL[] = [
            eq(facilityBookings.churchId, church.id),
            eq(facilityBookings.status, 'pending'),
            intersectsWindow(nowIso, FAR_FUTURE),
          ];
          if (!manager) pending.push(eq(facilityBookings.requestedBy, access.userId));
          overview.pendingCount =
            db
              .select({ value: count() })
              .from(facilityBookings)
              .where(and(...pending))
              .get()?.value ?? 0;

          const dayStart = startOfDayIn(church.timezone, new Date(now)).toISOString();
          const dayEnd = new Date(new Date(dayStart).getTime() + DAY_MS).toISOString();
          const activeIds = rows.map((row) => row.id);
          const todayRows =
            activeIds.length > 0
              ? db
                  .select()
                  .from(facilityBookings)
                  .where(
                    and(
                      eq(facilityBookings.churchId, church.id),
                      inArray(facilityBookings.resourceId, activeIds),
                      inArray(facilityBookings.status, ['approved', 'pending']),
                      intersectsWindow(dayStart, dayEnd),
                    ),
                  )
                  .all()
                  .filter(
                    (row) =>
                      row.status === 'approved' || manager || row.requestedBy === access.userId,
                  )
              : [];
          overview.today = expandOccurrences(db, todayRows, dayStart, dayEnd);

          const mine = db
            .select()
            .from(facilityBookings)
            .where(
              and(
                eq(facilityBookings.churchId, church.id),
                eq(facilityBookings.requestedBy, access.userId),
                inArray(facilityBookings.status, ['approved', 'pending']),
                intersectsWindow(nowIso, FAR_FUTURE),
              ),
            )
            .all();
          overview.myUpcoming = hydrateBookings(db, mine, access, now)
            .filter((item) => item.nextOccurrence)
            .sort((a, b) =>
              (a.nextOccurrence?.startsAt ?? '').localeCompare(b.nextOccurrence?.startsAt ?? ''),
            )
            .slice(0, MY_UPCOMING_MAX);
        }

        if (canViewInventory(access)) {
          const inService = and(
            eq(inventoryAssets.churchId, church.id),
            notInArray(inventoryAssets.status, ['retired', 'lost']),
          );
          const countAssets = (condition: SQL | undefined) =>
            db.select({ value: count() }).from(inventoryAssets).where(condition).get()?.value ?? 0;
          const totals = db
            .select({ total: count(), value: sum(inventoryAssets.acquisitionValue) })
            .from(inventoryAssets)
            .where(inService)
            .get();
          const overdueWhere = and(
            eq(assetLoans.churchId, church.id),
            isNull(assetLoans.returnedAt),
            isNotNull(assetLoans.dueDate),
            lt(assetLoans.dueDate, today),
          );
          const overdueLoans = db
            .select()
            .from(assetLoans)
            .where(overdueWhere)
            .orderBy(asc(assetLoans.dueDate))
            .limit(OVERDUE_SHOWN)
            .all();
          const soon = new Date(Date.parse(`${today}T00:00:00Z`) + MAINTENANCE_SOON_DAYS * DAY_MS)
            .toISOString()
            .slice(0, 10);
          const inServiceIds = new Set(
            db
              .select({ id: inventoryAssets.id })
              .from(inventoryAssets)
              .where(inService)
              .all()
              .map((row) => row.id),
          );
          overview.inventory = {
            totalAssets: totals?.total ?? 0,
            totalValue: Number(totals?.value ?? 0),
            onLoan: countAssets(
              and(eq(inventoryAssets.churchId, church.id), eq(inventoryAssets.status, 'on_loan')),
            ),
            overdue:
              db.select({ value: count() }).from(assetLoans).where(overdueWhere).get()?.value ?? 0,
            inMaintenance: countAssets(
              and(
                eq(inventoryAssets.churchId, church.id),
                eq(inventoryAssets.status, 'maintenance'),
              ),
            ),
            needsAttention: countAssets(
              and(inService, inArray(inventoryAssets.condition, ['poor', 'broken'])),
            ),
            maintenanceDue: [...nextMaintenanceDates(db, null, church.id)].filter(
              ([assetId, date]) => inServiceIds.has(assetId) && date <= soon,
            ).length,
            overdueLoans: hydrateLoans(db, overdueLoans, today),
          };
        }

        return overview;
      },
      {
        church: { module: 'facilities', permission: ANY_FACILITIES_PERMISSION },
        params: churchParamsSchema,
      },
    )
    .get(
      '/people',
      ({ church, query }) => {
        const conditions: SQL[] = [eq(people.churchId, church.id)];
        if (query.ids.length > 0) {
          conditions.push(inArray(people.id, query.ids));
        } else if (query.q) {
          const pattern = likePattern(query.q);
          const match = or(
            like(people.firstName, pattern),
            like(people.lastName, pattern),
            like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
          );
          if (match) conditions.push(match);
        }
        return {
          items: db
            .select()
            .from(people)
            .where(and(...conditions))
            .orderBy(asc(people.firstName), asc(people.lastName))
            .limit(PEOPLE_MAX)
            .all()
            .map(toPersonSummary),
        };
      },
      {
        church: { module: 'facilities', permission: ['inventory.manage', 'facilities.manage'] },
        params: churchParamsSchema,
        query: facilitiesPeopleQuerySchema,
      },
    );
};

/**
 * Facilities (sarana), bookings and inventory (inventaris).
 *
 * Owned by the facilities module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'facilities'`
 * (or `church: { module: 'facilities', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const facilitiesModule = (deps: Deps) =>
  new Elysia()
    .use(facilitiesHomeRouter(deps))
    .use(resourcesRouter(deps))
    .use(bookingsRouter(deps))
    .use(inventoryRouter(deps));
