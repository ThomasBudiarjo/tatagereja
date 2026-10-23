import {
  BULLETIN_SECTION_KINDS,
  DEFAULT_PERSON_PRIVACY,
  addDaysToDate,
  bulletinSectionSchema,
  bulletinWeekOf,
  canSeeBulletinFinance,
  fullName,
  zonedInstant,
  type AccessLike,
  type BulletinFinanceSummary,
  type BulletinItem,
  type BulletinRenderedSection,
  type BulletinSection,
  type BulletinSources,
} from '@tatagereja/shared';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import type { Queryable } from '../../db/client';
import type { BulletinRow, ChurchRow } from '../../db/schema';
import {
  announcements,
  events,
  financeCategories,
  financeEntries,
  householdMembers,
  people,
  personPrivacySettings,
  rosterAssignments,
  servingPositions,
  servingTeams,
  worshipServices,
} from '../../db/schema';
import { enabledModulesOf, moduleEnabled } from '../../services/modules';

const ITEMS_MAX = 30;

/** Stored sections, validated on read; unknown or broken entries are dropped. */
export const sectionsOf = (row: Pick<BulletinRow, 'sections'>): BulletinSection[] =>
  (Array.isArray(row.sections) ? row.sections : []).flatMap((section) => {
    const parsed = bulletinSectionSchema.safeParse(section);
    return parsed.success && (BULLETIN_SECTION_KINDS as readonly string[]).includes(parsed.data.kind)
      ? [parsed.data]
      : [];
  });

type Week = { from: string; to: string; fromInstant: string; toInstant: string };

export const weekWindow = (issueDate: string, timeZone: string): Week => {
  const week = bulletinWeekOf(issueDate);
  return {
    ...week,
    fromInstant: new Date(zonedInstant(week.from, 0, timeZone)).toISOString(),
    toInstant: new Date(zonedInstant(addDaysToDate(week.to, 1), 0, timeZone)).toISOString(),
  };
};

const item = (value: Partial<BulletinItem> & Pick<BulletinItem, 'id' | 'title'>): BulletinItem => ({
  subtitle: null,
  startsAt: null,
  date: null,
  body: null,
  years: null,
  ...value,
});

/** Keeps the chosen order when ids were picked, else the natural order. */
const pick = <T extends { id: string }>(rows: T[], itemIds: readonly string[]): T[] => {
  if (itemIds.length === 0) return rows.slice(0, ITEMS_MAX);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return itemIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
};

/** Church-wide announcements live during the week: the only ones a bulletin may carry. */
function weekAnnouncements(db: Queryable, church: ChurchRow, week: Week) {
  return db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.churchId, church.id),
        eq(announcements.status, 'published'),
        eq(announcements.audience, 'church'),
        or(isNull(announcements.publishAt), lt(announcements.publishAt, week.toInstant)),
        or(isNull(announcements.expiresAt), gt(announcements.expiresAt, week.fromInstant)),
      ),
    )
    .orderBy(
      desc(sql`${announcements.pinnedAt} is not null`),
      desc(sql`coalesce(${announcements.publishAt}, ${announcements.publishedAt})`),
    )
    .limit(50)
    .all();
}

function weekServices(db: Queryable, church: ChurchRow, week: Week) {
  if (!moduleEnabled(church, 'worship')) return [];
  return db
    .select()
    .from(worshipServices)
    .where(
      and(
        eq(worshipServices.churchId, church.id),
        eq(worshipServices.status, 'published'),
        gte(worshipServices.startsAt, week.fromInstant),
        lt(worshipServices.startsAt, week.toInstant),
      ),
    )
    .orderBy(asc(worshipServices.startsAt))
    .all();
}

function weekEvents(db: Queryable, church: ChurchRow, week: Week, includeGroups: boolean) {
  return db
    .select()
    .from(events)
    .where(
      and(
        eq(events.churchId, church.id),
        isNull(events.cancelledAt),
        gte(events.startsAt, week.fromInstant),
        lt(events.startsAt, week.toInstant),
        includeGroups ? undefined : isNull(events.groupId),
      ),
    )
    .orderBy(asc(events.startsAt))
    .all();
}

/** Week days by `MM-DD`, so birthdays and anniversaries match across years. */
const monthDays = (week: Week) => {
  const days = new Map<string, string>();
  for (let date = week.from; date <= week.to; date = addDaysToDate(date, 1)) {
    days.set(date.slice(5), date);
  }
  return days;
};

const showsBirthday = sql`coalesce((select ${personPrivacySettings.showBirthday} from ${personPrivacySettings} where ${personPrivacySettings.personId} = ${people.id}), ${DEFAULT_PERSON_PRIVACY.showBirthday ? 1 : 0}) = 1`;

function birthdays(db: Queryable, church: ChurchRow, week: Week): BulletinItem[] {
  const days = monthDays(week);
  return db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      birthDate: people.birthDate,
    })
    .from(people)
    .where(
      and(
        eq(people.churchId, church.id),
        isNotNull(people.birthDate),
        ne(people.membershipStatus, 'inactive'),
        inArray(sql`substr(${people.birthDate}, 6, 5)`, [...days.keys()]),
        // The bulletin is shared widely: every person's own choice applies, for every reader.
        showsBirthday,
      ),
    )
    .all()
    .flatMap((person) => {
      const date = days.get((person.birthDate ?? '').slice(5));
      if (!date || !person.birthDate) return [];
      return [
        item({
          id: person.id,
          title: fullName(person),
          date,
          years: Number(date.slice(0, 4)) - Number(person.birthDate.slice(0, 4)),
        }),
      ];
    })
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.title.localeCompare(b.title));
}

/** Couples married on the same day in one household are listed together. */
function anniversaries(db: Queryable, church: ChurchRow, week: Week): BulletinItem[] {
  const days = monthDays(week);
  const rows = db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      weddingDate: people.weddingDate,
      householdId: householdMembers.householdId,
    })
    .from(people)
    .leftJoin(householdMembers, eq(householdMembers.personId, people.id))
    .where(
      and(
        eq(people.churchId, church.id),
        isNotNull(people.weddingDate),
        ne(people.membershipStatus, 'inactive'),
        inArray(sql`substr(${people.weddingDate}, 6, 5)`, [...days.keys()]),
      ),
    )
    .orderBy(asc(people.firstName))
    .all();
  const couples = new Map<string, { ids: string[]; names: string[]; weddingDate: string }>();
  for (const row of rows) {
    if (!row.weddingDate) continue;
    const key = `${row.householdId ?? row.id}:${row.weddingDate}`;
    const couple = couples.get(key) ?? { ids: [], names: [], weddingDate: row.weddingDate };
    couple.ids.push(row.id);
    couple.names.push(fullName(row));
    couples.set(key, couple);
  }
  return [...couples.values()]
    .flatMap((couple) => {
      const date = days.get(couple.weddingDate.slice(5));
      if (!date) return [];
      return [
        item({
          id: couple.ids.join('+'),
          title: couple.names.join(' & '),
          date,
          years: Number(date.slice(0, 4)) - Number(couple.weddingDate.slice(0, 4)),
        }),
      ];
    })
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

/** Who serves where at each service: one item per service, positions as a list. */
function rosters(db: Queryable, church: ChurchRow, week: Week, itemIds: readonly string[]) {
  const services = pick(weekServices(db, church, week), itemIds);
  if (services.length === 0) return [];
  const rows = db
    .select({
      serviceId: rosterAssignments.serviceId,
      position: servingPositions.name,
      team: servingTeams.name,
      sortOrder: servingPositions.sortOrder,
      firstName: people.firstName,
      lastName: people.lastName,
    })
    .from(rosterAssignments)
    .innerJoin(servingPositions, eq(servingPositions.id, rosterAssignments.positionId))
    .innerJoin(servingTeams, eq(servingTeams.id, rosterAssignments.teamId))
    .innerJoin(people, eq(people.id, rosterAssignments.personId))
    .where(
      and(
        eq(rosterAssignments.churchId, church.id),
        inArray(
          rosterAssignments.serviceId,
          services.map((service) => service.id),
        ),
        ne(rosterAssignments.status, 'declined'),
      ),
    )
    .orderBy(asc(servingTeams.name), asc(servingPositions.sortOrder), asc(people.firstName))
    .all();
  return services.flatMap((service) => {
    const positions = new Map<string, string[]>();
    for (const row of rows.filter((entry) => entry.serviceId === service.id)) {
      const names = positions.get(row.position) ?? [];
      names.push(fullName(row));
      positions.set(row.position, names);
    }
    if (positions.size === 0) return [];
    return [
      item({
        id: service.id,
        title: service.title,
        startsAt: service.startsAt,
        body: [...positions].map(([position, names]) => `- **${position}**: ${names.join(', ')}`).join('\n'),
      }),
    ];
  });
}

/** Income by category and total spending over the week before the issue date. */
function financeSummary(db: Queryable, church: ChurchRow, week: Week): BulletinFinanceSummary {
  const from = addDaysToDate(week.from, -7);
  const to = addDaysToDate(week.from, -1);
  const where = and(
    eq(financeEntries.churchId, church.id),
    isNull(financeEntries.voidedAt),
    ne(financeEntries.sourceType, 'transfer'),
    gte(financeEntries.entryDate, from),
    lte(financeEntries.entryDate, to),
  );
  const byCategory = db
    .select({
      name: sql<string>`coalesce(${financeCategories.name}, 'Lain-lain')`,
      amount: sql<number>`coalesce(sum(${financeEntries.amount}), 0)`.mapWith(Number),
    })
    .from(financeEntries)
    .leftJoin(financeCategories, eq(financeCategories.id, financeEntries.categoryId))
    .where(and(where, gt(financeEntries.amount, 0)))
    .groupBy(financeCategories.name)
    .orderBy(desc(sql`sum(${financeEntries.amount})`))
    .all();
  const totals = db
    .select({
      income: sql<number>`coalesce(sum(case when ${financeEntries.amount} > 0 then ${financeEntries.amount} else 0 end), 0)`.mapWith(Number),
      expense: sql<number>`coalesce(sum(case when ${financeEntries.amount} < 0 then -${financeEntries.amount} else 0 end), 0)`.mapWith(Number),
    })
    .from(financeEntries)
    .where(where)
    .get();
  return {
    from,
    to,
    currency: church.currency,
    income: totals?.income ?? 0,
    expense: totals?.expense ?? 0,
    byCategory,
  };
}

/**
 * Resolves every section for one reader. The finance section is only rendered for holders of
 * `finance.reports` with finance switched on; everyone else does not get it at all.
 */
export function renderBulletin(
  db: Queryable,
  church: ChurchRow,
  access: Pick<AccessLike, 'permissions'>,
  row: BulletinRow,
): BulletinRenderedSection[] {
  const week = weekWindow(row.issueDate, church.timezone);
  const financeAllowed = canSeeBulletinFinance(access, enabledModulesOf(church));
  return sectionsOf(row).flatMap((section): BulletinRenderedSection[] => {
    const rendered = { ...section, items: [] as BulletinItem[], finance: null };
    switch (section.kind) {
      case 'text':
        return [rendered];
      case 'announcements':
        return [
          {
            ...rendered,
            items: pick(weekAnnouncements(db, church, week), section.itemIds).map((entry) =>
              item({ id: entry.id, title: entry.title, body: entry.body, startsAt: entry.publishAt ?? entry.publishedAt }),
            ),
          },
        ];
      case 'services':
        return [
          {
            ...rendered,
            items: pick(weekServices(db, church, week), section.itemIds).map((service) =>
              item({
                id: service.id,
                title: service.title,
                subtitle: [service.preacherName, service.theme].filter(Boolean).join(' · ') || null,
                startsAt: service.startsAt,
                body: service.location,
              }),
            ),
          },
        ];
      case 'rosters':
        return [{ ...rendered, items: rosters(db, church, week, section.itemIds) }];
      case 'events':
        return [
          {
            ...rendered,
            items: pick(
              weekEvents(db, church, week, section.itemIds.length > 0),
              section.itemIds,
            ).map((event) =>
              item({ id: event.id, title: event.title, startsAt: event.startsAt, subtitle: event.location }),
            ),
          },
        ];
      case 'birthdays':
        return [{ ...rendered, items: birthdays(db, church, week) }];
      case 'anniversaries':
        return [{ ...rendered, items: anniversaries(db, church, week) }];
      case 'finance':
        return financeAllowed ? [{ ...rendered, finance: financeSummary(db, church, week) }] : [];
    }
  });
}

/** What the editor can pick from for a given issue date. */
export function bulletinSources(
  db: Queryable,
  church: ChurchRow,
  access: Pick<AccessLike, 'permissions'>,
  issueDate: string,
): BulletinSources {
  const week = weekWindow(issueDate, church.timezone);
  return {
    week: { from: week.from, to: week.to },
    announcements: weekAnnouncements(db, church, week).map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.publishAt ?? row.publishedAt,
    })),
    services: weekServices(db, church, week).map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.startsAt,
    })),
    events: weekEvents(db, church, week, true).map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.startsAt,
    })),
    financeAvailable: canSeeBulletinFinance(access, enabledModulesOf(church)),
    servicesAvailable: moduleEnabled(church, 'worship'),
  };
}
