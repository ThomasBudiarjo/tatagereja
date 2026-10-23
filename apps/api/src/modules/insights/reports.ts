import {
  AGE_BANDS,
  AGE_BAND_LABELS,
  FOLLOW_UP_STAGES,
  FOLLOW_UP_STAGE_LABELS,
  GENDERS,
  GENDER_TEXT,
  HEADCOUNT_CATEGORIES,
  HEADCOUNT_LABELS,
  PERSON_MEMBERSHIP_STATUSES,
  PERSON_STATUS_TEXT,
  REPORT_LABELS,
  REPORT_MODULES,
  REPORT_TEXT,
  ageBandOf,
  ageOn,
  canViewReport,
  headcountTotal,
  localize,
  periodStartOf,
  reportParamsSchema,
  reportPeriods,
  reportQuerySchema,
  type Locale,
  type LocalizedText,
  type Report,
  type ReportBreakdown,
  type ReportKind,
  type ReportQuery,
  type ReportSeries,
  type ReportTextKey,
} from '@tatagereja/shared';
import { and, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { ChurchRow } from '../../db/schema';
import {
  areas,
  attendanceRecords,
  attendanceSessions,
  checkinSessions,
  financeCategories,
  financeEntries,
  financeFunds,
  groupMembers,
  groups,
  householdMembers,
  people,
  rosterAssignments,
  serviceTypes,
  servingTeamMembers,
  servingTeams,
  visitorFollowUps,
  worshipServices,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { forbidden, notFound } from '../../lib/errors';
import { enforceRateLimit } from '../../lib/rate-limit';
import { authPlugin } from '../../plugins/auth';
import { attendeesOf, headcountOf, localDayOf } from '../../services/attendance';
import { recordAudit } from '../../services/audit';
import { assertModuleEnabled, moduleEnabled } from '../../services/modules';
import { sendCsv, toCsv } from '../../services/people';
import { effectiveAreaByPerson } from '../../services/people-households';

/** Series per service or group in the attendance trend, besides the total. */
const TRACKS_MAX = 6;

type Context = {
  church: ChurchRow;
  query: ReportQuery;
  periods: string[];
  /** People limited to the members of `query.groupId`, or null for everyone. */
  groupPersonIds: Set<string> | null;
  text: (key: ReportTextKey) => string;
  label: (text: LocalizedText) => string;
};

/** A zeroed value per period. */
const emptyBuckets = (periods: readonly string[]) => new Map(periods.map((period) => [period, 0]));

const toPoints = (buckets: Map<string, number>) =>
  [...buckets].map(([x, y]) => ({ x, y: Math.round(y * 100) / 100 }));

const tally = (
  key: string,
  label: string,
  entries: Iterable<readonly [string, string, number]>,
  { keepZero = true, sort = false }: { keepZero?: boolean; sort?: boolean } = {},
): ReportBreakdown => {
  let items = [...entries].map(([itemKey, itemLabel, value]) => ({
    key: itemKey,
    label: itemLabel,
    value,
  }));
  if (!keepZero) items = items.filter((item) => item.value !== 0);
  if (sort) items.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return { key, label, items };
};

const ratio = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 1000;

/** The last day of a period (the day before the `next` one starts), capped by `to`. */
const periodLastDay = (next: string | undefined, to: string) => {
  if (!next) return to;
  const day = new Date(`${next}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  const last = day.toISOString().slice(0, 10);
  return last < to ? last : to;
};

export const insightsReportsRouter = (deps: Deps) => {
  const { db } = deps;

  /** The day a person joined: their join date, or the day they were added. */
  const joinDayOf = (church: ChurchRow, row: { joinedAt: string | null; createdAt: string }) =>
    row.joinedAt ?? localDayOf(row.createdAt, church.timezone);

  const peopleOf = (context: Context) =>
    db
      .select({
        id: people.id,
        gender: people.gender,
        birthDate: people.birthDate,
        membershipStatus: people.membershipStatus,
        joinedAt: people.joinedAt,
        createdAt: people.createdAt,
      })
      .from(people)
      .where(eq(people.churchId, context.church.id))
      .all()
      .filter((row) => !context.groupPersonIds || context.groupPersonIds.has(row.id));

  const membershipGrowth = (context: Context): Omit<Report, 'kind'> => {
    const { church, query, periods } = context;
    const rows = peopleOf(context).map((row) => ({ ...row, joinDay: joinDayOf(church, row) }));
    const joined = emptyBuckets(periods);
    const joinedMembers = emptyBuckets(periods);
    const total = emptyBuckets(periods);
    for (const row of rows) {
      if (row.joinDay < query.from || row.joinDay > query.to) continue;
      const period = periodStartOf(row.joinDay, query.interval);
      joined.set(period, (joined.get(period) ?? 0) + 1);
      if (row.membershipStatus === 'member') {
        joinedMembers.set(period, (joinedMembers.get(period) ?? 0) + 1);
      }
    }
    periods.forEach((period, index) => {
      const last = periodLastDay(periods[index + 1], query.to);
      total.set(period, rows.filter((row) => row.joinDay <= last).length);
    });
    const startTotal = rows.filter((row) => row.joinDay < query.from).length;
    const endTotal = rows.filter((row) => row.joinDay <= query.to).length;
    return {
      ...rangeOf(query),
      unit: 'count',
      series: [
        { key: 'total', label: context.text('total'), points: toPoints(total) },
        { key: 'new', label: context.text('new'), points: toPoints(joined) },
        { key: 'newMembers', label: context.text('newMembers'), points: toPoints(joinedMembers) },
      ],
      breakdowns: [],
      totals: {
        total: endTotal,
        new: endTotal - startTotal,
        newMembers: [...joinedMembers.values()].reduce((sum, value) => sum + value, 0),
        startTotal,
        growthRate: ratio(endTotal - startTotal, startTotal),
      },
    };
  };

  const statusBreakdown = (context: Context): Omit<Report, 'kind'> => {
    const { church, query } = context;
    const rows = peopleOf(context).filter((row) => joinDayOf(church, row) <= query.to);
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.membershipStatus, (counts.get(row.membershipStatus) ?? 0) + 1);
    }
    return {
      ...rangeOf(query),
      unit: 'count',
      series: [],
      breakdowns: [
        tally(
          'status',
          context.text('status'),
          PERSON_MEMBERSHIP_STATUSES.map(
            (status) =>
              [status, context.label(PERSON_STATUS_TEXT[status]), counts.get(status) ?? 0] as const,
          ),
        ),
      ],
      totals: {
        total: rows.length,
        ...Object.fromEntries(
          PERSON_MEMBERSHIP_STATUSES.map((status) => [status, counts.get(status) ?? 0]),
        ),
      },
    };
  };

  /**
   * Age bands, gender, area and household. Only aggregate counts leave the server, so every
   * birth date counts, including those people hide from the directory.
   */
  const demographics = (context: Context): Omit<Report, 'kind'> => {
    const { church, query } = context;
    const rows = peopleOf(context).filter(
      (row) => row.membershipStatus !== 'inactive' && joinDayOf(church, row) <= query.to,
    );
    const ages = new Map<string, number>();
    const genders = new Map<string, number>();
    const areaCounts = new Map<string, number>();
    const areaOf = effectiveAreaByPerson(db, church.id);
    const inHousehold = new Set(
      db
        .select({ personId: householdMembers.personId })
        .from(householdMembers)
        .where(eq(householdMembers.churchId, church.id))
        .all()
        .map((row) => row.personId),
    );
    let ageSum = 0;
    let ageCount = 0;
    for (const row of rows) {
      const age = row.birthDate ? ageOn(row.birthDate, query.to) : null;
      if (age !== null && age >= 0) {
        ageSum += age;
        ageCount += 1;
      }
      const band = ageBandOf(age);
      ages.set(band, (ages.get(band) ?? 0) + 1);
      genders.set(row.gender, (genders.get(row.gender) ?? 0) + 1);
      const area = areaOf.get(row.id) ?? '';
      areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
    }
    const areaRows = db
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(eq(areas.churchId, church.id))
      .all();
    const housed = rows.filter((row) => inHousehold.has(row.id)).length;
    return {
      ...rangeOf(query),
      unit: 'count',
      series: [],
      breakdowns: [
        tally(
          'age',
          context.text('age'),
          AGE_BANDS.map(
            (band) => [band, context.label(AGE_BAND_LABELS[band]), ages.get(band) ?? 0] as const,
          ),
        ),
        tally(
          'gender',
          context.text('gender'),
          GENDERS.map(
            (gender) =>
              [gender, context.label(GENDER_TEXT[gender]), genders.get(gender) ?? 0] as const,
          ),
        ),
        tally(
          'area',
          context.text('area'),
          [
            ...areaRows.map((area) => [area.id, area.name, areaCounts.get(area.id) ?? 0] as const),
            ['none', context.text('noArea'), areaCounts.get('') ?? 0] as const,
          ],
          { keepZero: false, sort: true },
        ),
        tally('household', context.text('household'), [
          ['in_household', context.text('inHousehold'), housed],
          ['no_household', context.text('noHousehold'), rows.length - housed],
        ]),
      ],
      totals: {
        people: rows.length,
        averageAge: ageCount === 0 ? 0 : Math.round((ageSum / ageCount) * 10) / 10,
        withBirthDate: ageCount,
        inHousehold: housed,
      },
    };
  };

  const attendanceTrend = (context: Context): Omit<Report, 'kind'> => {
    const { church, query, periods } = context;
    const conditions = [
      eq(attendanceSessions.churchId, church.id),
      gte(attendanceSessions.sessionAt, `${dayBeforeIso(query.from)}`),
      lte(attendanceSessions.sessionAt, `${dayAfterIso(query.to)}`),
    ];
    if (query.groupId) conditions.push(eq(attendanceSessions.groupId, query.groupId));
    const sessions = db
      .select()
      .from(attendanceSessions)
      .where(and(...conditions))
      .all()
      .map((row) => ({ row, day: localDayOf(row.sessionAt, church.timezone) }))
      .filter(({ day }) => day >= query.from && day <= query.to);
    const ids = sessions.map(({ row }) => row.id);

    const present = new Map<string, number>();
    if (ids.length > 0) {
      for (const record of db
        .select({ sessionId: attendanceRecords.sessionId })
        .from(attendanceRecords)
        .where(
          and(inArray(attendanceRecords.sessionId, ids), eq(attendanceRecords.status, 'present')),
        )
        .all()) {
        present.set(record.sessionId, (present.get(record.sessionId) ?? 0) + 1);
      }
    }

    // A session's track: its worship service type, Sekolah Minggu, its group, or church-wide.
    const serviceTypeOf = new Map<string, { id: string; name: string }>();
    const sundaySchool = new Set<string>();
    if (ids.length > 0) {
      if (moduleEnabled(church, 'worship')) {
        for (const row of db
          .select({
            sessionId: worshipServices.attendanceSessionId,
            id: serviceTypes.id,
            name: serviceTypes.name,
          })
          .from(worshipServices)
          .innerJoin(serviceTypes, eq(serviceTypes.id, worshipServices.serviceTypeId))
          .where(
            and(
              eq(worshipServices.churchId, church.id),
              inArray(worshipServices.attendanceSessionId, ids),
            ),
          )
          .all()) {
          if (row.sessionId) serviceTypeOf.set(row.sessionId, { id: row.id, name: row.name });
        }
      }
      for (const row of db
        .select({ sessionId: checkinSessions.attendanceSessionId })
        .from(checkinSessions)
        .where(
          and(
            eq(checkinSessions.churchId, church.id),
            inArray(checkinSessions.attendanceSessionId, ids),
          ),
        )
        .all()) {
        if (row.sessionId) sundaySchool.add(row.sessionId);
      }
    }
    const groupNames = new Map(
      db
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(eq(groups.churchId, church.id))
        .all()
        .map((row) => [row.id, row.name]),
    );
    const trackOf = (row: (typeof sessions)[number]['row']) => {
      const type = serviceTypeOf.get(row.id);
      if (type) return { key: `service:${type.id}`, label: type.name };
      if (sundaySchool.has(row.id))
        return { key: 'sunday_school', label: context.text('sundaySchool') };
      if (row.groupId) {
        return { key: `group:${row.groupId}`, label: groupNames.get(row.groupId) ?? '' };
      }
      return { key: 'church', label: context.text('churchWide') };
    };

    const total = emptyBuckets(periods);
    const sessionCount = emptyBuckets(periods);
    const tracks = new Map<
      string,
      { label: string; buckets: Map<string, number>; attendees: number; sessions: number }
    >();
    const headcount = { men: 0, women: 0, children: 0, visitors: 0 };
    let peak = 0;
    let attendanceTotal = 0;
    for (const { row, day } of sessions) {
      const attendees = attendeesOf(row, present.get(row.id) ?? 0);
      const period = periodStartOf(day, query.interval);
      total.set(period, (total.get(period) ?? 0) + attendees);
      sessionCount.set(period, (sessionCount.get(period) ?? 0) + 1);
      attendanceTotal += attendees;
      peak = Math.max(peak, attendees);
      const counts = headcountOf(row);
      if (counts) {
        for (const category of HEADCOUNT_CATEGORIES) headcount[category] += counts[category];
      }
      const track = trackOf(row);
      const entry = tracks.get(track.key) ?? {
        label: track.label,
        buckets: emptyBuckets(periods),
        attendees: 0,
        sessions: 0,
      };
      entry.buckets.set(period, (entry.buckets.get(period) ?? 0) + attendees);
      entry.attendees += attendees;
      entry.sessions += 1;
      tracks.set(track.key, entry);
    }
    const ranked = [...tracks].sort((a, b) => b[1].attendees - a[1].attendees);
    const series: ReportSeries[] = [
      { key: 'total', label: context.text('attendance'), points: toPoints(total) },
      { key: 'sessions', label: context.text('sessions'), points: toPoints(sessionCount) },
      ...(ranked.length > 1
        ? ranked.slice(0, TRACKS_MAX).map(([key, entry]) => ({
            key,
            label: entry.label,
            points: toPoints(entry.buckets),
          }))
        : []),
    ];
    const breakdowns: ReportBreakdown[] = [
      tally(
        'tracks',
        context.text('tracks'),
        ranked.map(
          ([key, entry]) =>
            [key, entry.label, Math.round(entry.attendees / Math.max(1, entry.sessions))] as const,
        ),
      ),
    ];
    if (headcountTotal(headcount) > 0) {
      breakdowns.push(
        tally(
          'headcount',
          context.text('headcount'),
          HEADCOUNT_CATEGORIES.map(
            (category) =>
              [category, context.label(HEADCOUNT_LABELS[category]), headcount[category]] as const,
          ),
        ),
      );
    }
    return {
      ...rangeOf(query),
      unit: 'count',
      series,
      breakdowns,
      totals: {
        sessions: sessions.length,
        attendance: attendanceTotal,
        average: sessions.length === 0 ? 0 : Math.round(attendanceTotal / sessions.length),
        peak,
      },
    };
  };

  const visitorConversion = (context: Context): Omit<Report, 'kind'> => {
    const { church, query, periods } = context;
    const careOn = moduleEnabled(church, 'care');
    const followUps = careOn
      ? db
          .select({
            personId: visitorFollowUps.personId,
            stage: visitorFollowUps.stage,
            source: visitorFollowUps.source,
            firstVisitDate: visitorFollowUps.firstVisitDate,
            createdAt: visitorFollowUps.createdAt,
          })
          .from(visitorFollowUps)
          .where(eq(visitorFollowUps.churchId, church.id))
          .all()
      : [];
    const followUpOf = new Map(followUps.map((row) => [row.personId, row]));
    const persons = peopleOf(context);
    const visitors = new Map<
      string,
      { day: string; converted: boolean; stage: string | null; source: string | null }
    >();
    for (const followUp of followUps) {
      const person = persons.find((row) => row.id === followUp.personId);
      if (!person) continue;
      const day = followUp.firstVisitDate ?? localDayOf(followUp.createdAt, church.timezone);
      visitors.set(person.id, {
        day,
        converted:
          followUp.stage === 'joined' ||
          person.membershipStatus === 'member' ||
          person.membershipStatus === 'regular',
        stage: followUp.stage,
        source: followUp.source?.trim() || null,
      });
    }
    for (const person of persons) {
      if (visitors.has(person.id) || followUpOf.has(person.id)) continue;
      if (person.membershipStatus !== 'visitor' && person.membershipStatus !== 'regular') continue;
      visitors.set(person.id, {
        day: joinDayOf(church, person),
        converted: person.membershipStatus === 'regular',
        stage: null,
        source: null,
      });
    }
    const inRange = [...visitors.values()].filter(
      (visitor) => visitor.day >= query.from && visitor.day <= query.to,
    );
    const newVisitors = emptyBuckets(periods);
    const converted = emptyBuckets(periods);
    for (const visitor of inRange) {
      const period = periodStartOf(visitor.day, query.interval);
      newVisitors.set(period, (newVisitors.get(period) ?? 0) + 1);
      if (visitor.converted) converted.set(period, (converted.get(period) ?? 0) + 1);
    }
    // Visitors counted at headcount services (anonymous).
    const counted = emptyBuckets(periods);
    for (const row of db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.churchId, church.id),
          eq(attendanceSessions.mode, 'headcount'),
          gte(attendanceSessions.sessionAt, dayBeforeIso(query.from)),
          lte(attendanceSessions.sessionAt, dayAfterIso(query.to)),
        ),
      )
      .all()) {
      const day = localDayOf(row.sessionAt, church.timezone);
      if (day < query.from || day > query.to) continue;
      const period = periodStartOf(day, query.interval);
      counted.set(period, (counted.get(period) ?? 0) + (row.headcountVisitors ?? 0));
    }
    const convertedTotal = inRange.filter((visitor) => visitor.converted).length;
    const breakdowns: ReportBreakdown[] = [];
    if (careOn) {
      const stages = new Map<string, number>();
      const sources = new Map<string, number>();
      for (const visitor of inRange) {
        if (!visitor.stage) continue;
        stages.set(visitor.stage, (stages.get(visitor.stage) ?? 0) + 1);
        const source = visitor.source ?? '';
        sources.set(source, (sources.get(source) ?? 0) + 1);
      }
      breakdowns.push(
        tally(
          'stages',
          context.text('stages'),
          FOLLOW_UP_STAGES.map(
            (stage) =>
              [
                stage,
                context.label(FOLLOW_UP_STAGE_LABELS[stage]),
                stages.get(stage) ?? 0,
              ] as const,
          ),
        ),
        tally(
          'sources',
          context.text('sources'),
          [...sources].map(
            ([source, value]) =>
              [source || 'unknown', source || context.text('unknownSource'), value] as const,
          ),
          { sort: true },
        ),
      );
    }
    return {
      ...rangeOf(query),
      unit: 'count',
      series: [
        { key: 'visitors', label: context.text('visitors'), points: toPoints(newVisitors) },
        { key: 'converted', label: context.text('converted'), points: toPoints(converted) },
        { key: 'counted', label: context.text('counted'), points: toPoints(counted) },
      ],
      breakdowns,
      totals: {
        visitors: inRange.length,
        converted: convertedTotal,
        conversionRate: ratio(convertedTotal, inRange.length),
        counted: [...counted.values()].reduce((sum, value) => sum + value, 0),
      },
    };
  };

  const volunteerEngagement = (context: Context): Omit<Report, 'kind'> => {
    const { church, query, periods } = context;
    const rows = db
      .select({
        personId: rosterAssignments.personId,
        teamId: rosterAssignments.teamId,
        status: rosterAssignments.status,
        startsAt: worshipServices.startsAt,
      })
      .from(rosterAssignments)
      .innerJoin(worshipServices, eq(worshipServices.id, rosterAssignments.serviceId))
      .where(
        and(
          eq(rosterAssignments.churchId, church.id),
          ne(worshipServices.status, 'cancelled'),
          gte(worshipServices.startsAt, dayBeforeIso(query.from)),
          lte(worshipServices.startsAt, dayAfterIso(query.to)),
        ),
      )
      .all()
      .map((row) => ({ ...row, day: localDayOf(row.startsAt, church.timezone) }))
      .filter((row) => row.day >= query.from && row.day <= query.to)
      .filter((row) => !context.groupPersonIds || context.groupPersonIds.has(row.personId));
    const serving = new Map(periods.map((period) => [period, new Set<string>()]));
    const assignments = emptyBuckets(periods);
    const declined = emptyBuckets(periods);
    const active = new Set<string>();
    const perTeam = new Map<string, Set<string>>();
    let accepted = 0;
    let declinedTotal = 0;
    for (const row of rows) {
      const period = periodStartOf(row.day, query.interval);
      if (row.status === 'declined') {
        declined.set(period, (declined.get(period) ?? 0) + 1);
        declinedTotal += 1;
        continue;
      }
      if (row.status === 'accepted') accepted += 1;
      serving.get(period)?.add(row.personId);
      assignments.set(period, (assignments.get(period) ?? 0) + 1);
      active.add(row.personId);
      const team = perTeam.get(row.teamId) ?? new Set<string>();
      team.add(row.personId);
      perTeam.set(row.teamId, team);
    }
    const teams = db
      .select({ id: servingTeams.id, name: servingTeams.name })
      .from(servingTeams)
      .where(eq(servingTeams.churchId, church.id))
      .all();
    const teamMembers = new Set(
      db
        .select({ personId: servingTeamMembers.personId })
        .from(servingTeamMembers)
        .where(eq(servingTeamMembers.churchId, church.id))
        .all()
        .map((row) => row.personId)
        .filter((id) => !context.groupPersonIds || context.groupPersonIds.has(id)),
    );
    return {
      ...rangeOf(query),
      unit: 'count',
      series: [
        {
          key: 'volunteers',
          label: context.text('volunteers'),
          points: [...serving].map(([x, set]) => ({ x, y: set.size })),
        },
        { key: 'assignments', label: context.text('assignments'), points: toPoints(assignments) },
        { key: 'declined', label: context.text('declined'), points: toPoints(declined) },
      ],
      breakdowns: [
        tally(
          'teams',
          context.text('teams'),
          teams.map((team) => [team.id, team.name, perTeam.get(team.id)?.size ?? 0] as const),
          { sort: true },
        ),
      ],
      totals: {
        activeVolunteers: active.size,
        assignments: [...assignments.values()].reduce((sum, value) => sum + value, 0),
        declined: declinedTotal,
        acceptanceRate: ratio(accepted, accepted + declinedTotal),
        teamMembers: teamMembers.size,
        engagementRate: ratio(active.size, teamMembers.size),
      },
    };
  };

  /** Offerings and contributions posted to the ledger (live entries only), in minor units. */
  const givingTrend = (context: Context): Omit<Report, 'kind'> => {
    const { church, query, periods } = context;
    const lengthDays = Math.round((Date.parse(query.to) - Date.parse(query.from)) / 86_400_000);
    const previousTo = dayBefore(query.from);
    const previousFrom = shiftDays(previousTo, -lengthDays);
    const rows = db
      .select({
        entryDate: financeEntries.entryDate,
        amount: financeEntries.amount,
        sourceType: financeEntries.sourceType,
        fundId: financeEntries.fundId,
        categoryId: financeEntries.categoryId,
      })
      .from(financeEntries)
      .where(
        and(
          eq(financeEntries.churchId, church.id),
          isNull(financeEntries.voidedAt),
          inArray(financeEntries.sourceType, ['offering', 'contribution']),
          gte(financeEntries.entryDate, previousFrom),
          lte(financeEntries.entryDate, query.to),
        ),
      )
      .all()
      .filter((row) => row.amount > 0);
    const current = rows.filter((row) => row.entryDate >= query.from);
    const previousTotal = rows
      .filter((row) => row.entryDate < query.from)
      .reduce((sum, row) => sum + row.amount, 0);
    const offerings = emptyBuckets(periods);
    const contributions = emptyBuckets(periods);
    const total = emptyBuckets(periods);
    const byFund = new Map<string, number>();
    const byCategory = new Map<string, number>();
    for (const row of current) {
      const period = periodStartOf(row.entryDate, query.interval);
      const target = row.sourceType === 'offering' ? offerings : contributions;
      target.set(period, (target.get(period) ?? 0) + row.amount);
      total.set(period, (total.get(period) ?? 0) + row.amount);
      byFund.set(row.fundId, (byFund.get(row.fundId) ?? 0) + row.amount);
      const category = row.categoryId ?? '';
      byCategory.set(category, (byCategory.get(category) ?? 0) + row.amount);
    }
    const fundNames = new Map(
      db
        .select({ id: financeFunds.id, name: financeFunds.name })
        .from(financeFunds)
        .where(eq(financeFunds.churchId, church.id))
        .all()
        .map((row) => [row.id, row.name]),
    );
    const categoryNames = new Map(
      db
        .select({ id: financeCategories.id, name: financeCategories.name })
        .from(financeCategories)
        .where(eq(financeCategories.churchId, church.id))
        .all()
        .map((row) => [row.id, row.name]),
    );
    const sum = current.reduce((acc, row) => acc + row.amount, 0);
    return {
      ...rangeOf(query),
      unit: 'money',
      series: [
        { key: 'total', label: context.text('total'), points: toPoints(total) },
        { key: 'offerings', label: context.text('offerings'), points: toPoints(offerings) },
        {
          key: 'contributions',
          label: context.text('contributions'),
          points: toPoints(contributions),
        },
      ],
      breakdowns: [
        tally(
          'funds',
          context.text('funds'),
          [...byFund].map(([id, value]) => [id, fundNames.get(id) ?? '?', value] as const),
          { sort: true },
        ),
        tally(
          'categories',
          context.text('categories'),
          [...byCategory].map(
            ([id, value]) =>
              [
                id || 'none',
                id ? (categoryNames.get(id) ?? '?') : context.text('noCategory'),
                value,
              ] as const,
          ),
          { sort: true },
        ),
      ],
      totals: {
        total: sum,
        offerings: [...offerings.values()].reduce((acc, value) => acc + value, 0),
        contributions: [...contributions.values()].reduce((acc, value) => acc + value, 0),
        averagePerPeriod: periods.length === 0 ? 0 : Math.round(sum / periods.length),
        previousTotal,
        change: ratio(sum - previousTotal, previousTotal),
      },
    };
  };

  const builders: Record<ReportKind, (context: Context) => Omit<Report, 'kind'>> = {
    membership_growth: membershipGrowth,
    status_breakdown: statusBreakdown,
    demographics,
    attendance_trend: attendanceTrend,
    visitor_conversion: visitorConversion,
    volunteer_engagement: volunteerEngagement,
    giving_trend: givingTrend,
  };

  /** Trend rows per period, then each breakdown and the headline numbers. */
  const csvOf = (report: Report, locale: Locale, currency: string) => {
    const text = (key: ReportTextKey) => localize(REPORT_TEXT[key], locale);
    const unit = report.unit === 'money' ? ` (${currency})` : '';
    const rows: (string | number)[][] = [
      [localize(REPORT_LABELS[report.kind], locale)],
      [`${report.from} – ${report.to}`],
    ];
    if (report.series.length > 0) {
      rows.push([], [text('period'), ...report.series.map((series) => `${series.label}${unit}`)]);
      const first = report.series[0]?.points ?? [];
      first.forEach((point, index) => {
        rows.push([point.x, ...report.series.map((series) => series.points[index]?.y ?? 0)]);
      });
    }
    for (const breakdown of report.breakdowns) {
      rows.push([], [breakdown.label, `${text('value')}${unit}`]);
      for (const item of breakdown.items) rows.push([item.label, item.value]);
    }
    rows.push([], [text('summary'), text('value')]);
    for (const [key, value] of Object.entries(report.totals)) rows.push([key, value]);
    return toCsv(rows);
  };

  return new Elysia({ prefix: '/churches/:churchId/insights/reports' }).use(authPlugin(deps)).get(
    '/:kind',
    ({ church, access, auth, audit, params, query, set }) => {
      const module = REPORT_MODULES[params.kind];
      if (module) assertModuleEnabled(church, module);
      if (!canViewReport(access, params.kind)) {
        throw forbidden('You cannot view this report');
      }
      let groupPersonIds: Set<string> | null = null;
      if (query.groupId) {
        const group = db
          .select({ id: groups.id })
          .from(groups)
          .where(and(eq(groups.id, query.groupId), eq(groups.churchId, church.id)))
          .get();
        if (!group) throw notFound('Group');
        groupPersonIds = new Set(
          db
            .select({ personId: groupMembers.personId })
            .from(groupMembers)
            .where(and(eq(groupMembers.churchId, church.id), eq(groupMembers.groupId, group.id)))
            .all()
            .map((row) => row.personId),
        );
      }
      // Nothing has happened after today yet, so the range stops there (no empty future periods).
      const today = localDayOf(new Date().toISOString(), church.timezone);
      const range = {
        ...query,
        to: query.to > today ? (query.from > today ? query.from : today) : query.to,
      };
      const context: Context = {
        church,
        query: range,
        periods: reportPeriods(range.from, range.to, range.interval),
        groupPersonIds,
        text: (key) => localize(REPORT_TEXT[key], query.locale),
        label: (text) => localize(text, query.locale),
      };
      const report: Report = { kind: params.kind, ...builders[params.kind](context) };
      if (query.format !== 'csv') return report;

      enforceRateLimit(deps.limiters, 'insights.export', `${church.id}:${auth.user.id}`, {
        windowMs: 10 * 60_000,
        max: 60,
      });
      recordAudit(db, audit, {
        module: 'insights',
        action: 'report.export',
        entityType: 'report',
        entityId: params.kind,
        summary: `Exported the ${REPORT_LABELS[params.kind].en.toLowerCase()} report`,
        after: { from: query.from, to: query.to, interval: query.interval, groupId: query.groupId },
      });
      return sendCsv(
        set,
        `laporan-${params.kind.replace(/_/g, '-')}-${query.from}-${query.to}.csv`,
        csvOf(report, query.locale, church.currency),
      );
    },
    {
      church: { permission: 'reports.view', message: 'You cannot view reports' },
      params: reportParamsSchema,
      query: reportQuerySchema,
    },
  );
};

const rangeOf = (query: ReportQuery) => ({
  from: query.from,
  to: query.to,
  interval: query.interval,
});

const shiftDays = (date: string, days: number) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};

const dayBefore = (date: string) => shiftDays(date, -1);

/** Instants are stored in UTC; widen by a day so every local day of the range is read. */
const dayBeforeIso = (date: string) => `${dayBefore(date)}T00:00:00.000Z`;
const dayAfterIso = (date: string) => `${shiftDays(date, 2)}T00:00:00.000Z`;
