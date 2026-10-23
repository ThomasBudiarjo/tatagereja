import { OPTIONAL_MODULE_IDS } from '@tatagereja/shared';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq, getTableName, sql, type SQL } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { ENCRYPTED_COLUMNS } from '../src/db/encrypted';
import * as schema from '../src/db/schema';
import { nowIso } from '../src/lib/time';
import { generateCode, generateToken, hashToken, newId } from '../src/lib/tokens';
import { createTestApp, seedChurch } from './helpers';

/** Every table added for the feature modules that is owned by a church. */
const CHURCH_TABLES: SQLiteTable[] = [
  schema.eventSeries,
  schema.areas,
  schema.areaCoordinators,
  schema.households,
  schema.householdMembers,
  schema.personAreas,
  schema.personTags,
  schema.personTagAssignments,
  schema.customFieldDefinitions,
  schema.customFieldValues,
  schema.personPrivacySettings,
  schema.groupJoinRequests,
  schema.announcementAudienceRoles,
  schema.announcementReads,
  schema.eventRegistrations,
  schema.calendarFeedTokens,
  schema.bulletins,
  schema.dashboardPreferences,
  schema.absenceAlerts,
  schema.serviceTypes,
  schema.worshipServices,
  schema.songs,
  schema.liturgyItems,
  schema.servingTeams,
  schema.servingPositions,
  schema.servingTeamMembers,
  schema.servingMemberPositions,
  schema.rosterAssignments,
  schema.volunteerBlockouts,
  schema.careCases,
  schema.careCaseCaregivers,
  schema.careNotes,
  schema.careVisits,
  schema.careVisitVisitors,
  schema.prayerRequests,
  schema.prayerRequestPrayers,
  schema.visitorFollowUps,
  schema.careTasks,
  schema.diakoniaAid,
  schema.registryRecords,
  schema.registryRecordPeople,
  schema.financeFunds,
  schema.financeAccounts,
  schema.financeCategories,
  schema.financePeriods,
  schema.financeEntries,
  schema.offeringBatches,
  schema.offeringBatchLines,
  schema.financeCampaigns,
  schema.financePledges,
  schema.financeContributions,
  schema.expenseRequests,
  schema.financeBudgets,
  schema.financeTransfers,
  schema.facilityResources,
  schema.facilityBookings,
  schema.facilityBookingExceptions,
  schema.inventoryAssets,
  schema.assetLoans,
  schema.assetMaintenance,
  schema.checkinClasses,
  schema.checkinClassTeachers,
  schema.checkinSessions,
  schema.checkinChildProfiles,
  schema.checkinChildAlerts,
  schema.checkinAuthorizedPickups,
  schema.checkins,
];

/** Account-security tables cascade from the user instead. */
const USER_TABLES: SQLiteTable[] = [
  schema.userTwoFactor,
  schema.userRecoveryCodes,
  schema.twoFactorChallenges,
  schema.loginEvents,
  schema.passwordResetTokens,
];

const MODULE_PATHS: Record<string, string> = {
  'admin-security': 'security',
  people: 'directory',
  comms: 'calendar',
  insights: 'insights',
  worship: 'worship',
  care: 'care',
  records: 'records',
  finance: 'finance',
  facilities: 'facilities',
  checkin: 'checkin',
};

describe('modules data model', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  const { db } = t;
  let s: Awaited<ReturnType<typeof seedChurch>>;

  const countWhere = (table: SQLiteTable, where: SQL): number => {
    const [row] = db.all<{ value: number }>(
      sql`select count(*) as value from ${table} where ${where}`,
    );
    if (typeof row?.value !== 'number') throw new Error(`Cannot count ${getTableName(table)}`);
    return row.value;
  };
  const countForChurch = (table: SQLiteTable, churchId: string) =>
    countWhere(table, sql`church_id = ${churchId}`);
  const countForUser = (table: SQLiteTable, userId: string) =>
    countWhere(table, sql`user_id = ${userId}`);

  beforeAll(async () => {
    s = await seedChurch(t);
  });

  it('applies every migration when the database opens', () => {
    for (const table of [...CHURCH_TABLES, ...USER_TABLES]) {
      expect(() => countWhere(table, sql`1 = 1`)).not.toThrow();
    }
    const columns = db
      .all<{ name: string }>(sql`select name from pragma_table_info('events')`)
      .map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining(['series_id', 'capacity', 'cancelled_at']));
  });

  it('stores a row in every module table and removes them all with the church', () => {
    const now = nowIso();
    const today = now.slice(0, 10);
    const churchId = s.church.id;
    const ownerId = s.owner.user.id;
    const child = s.alice.id;
    const guardian = s.bob.id;
    const id = () => newId();

    const roleId = db
      .select({ id: schema.churchRoles.id })
      .from(schema.churchRoles)
      .where(eq(schema.churchRoles.churchId, churchId))
      .get()?.id;
    expect(roleId).toBeDefined();
    const announcementId = id();
    db.insert(schema.announcements)
      .values({
        id: announcementId,
        churchId,
        title: 'Warta',
        body: 'Isi',
        audience: 'roles',
        pinnedAt: now,
        createdBy: ownerId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const eventId = id();
    const seriesId = id();
    db.insert(schema.eventSeries)
      .values({
        id: seriesId,
        churchId,
        title: 'Persekutuan Doa',
        frequency: 'weekly',
        startsAt: now,
        untilDate: today,
        createdBy: ownerId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.events)
      .values({
        id: eventId,
        churchId,
        title: 'Retret',
        startsAt: now,
        seriesId,
        capacity: 10,
        registrationRequired: true,
        createdBy: ownerId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const attendanceSessionId = id();
    db.insert(schema.attendanceSessions)
      .values({
        id: attendanceSessionId,
        churchId,
        title: 'Ibadah Umum',
        sessionAt: now,
        mode: 'headcount',
        headcountMen: 40,
        headcountWomen: 52,
        createdBy: ownerId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // people
    const areaId = id();
    db.insert(schema.areas)
      .values({ id: areaId, churchId, name: 'Wilayah 1', createdAt: now, updatedAt: now })
      .run();
    db.insert(schema.areaCoordinators)
      .values({ id: id(), churchId, areaId, userId: s.leader.user.id, assignedAt: now })
      .run();
    const householdId = id();
    db.insert(schema.households)
      .values({
        id: householdId,
        churchId,
        name: 'Keluarga Smith',
        areaId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.householdMembers)
      .values([
        { id: id(), churchId, householdId, personId: guardian, relationship: 'head', addedAt: now },
        { id: id(), churchId, householdId, personId: child, relationship: 'child', addedAt: now },
      ])
      .run();
    db.insert(schema.personAreas)
      .values({ personId: child, churchId, areaId, assignedAt: now })
      .run();
    const tagId = id();
    db.insert(schema.personTags)
      .values({ id: tagId, churchId, name: 'Paduan suara', createdAt: now })
      .run();
    db.insert(schema.personTagAssignments)
      .values({ personId: child, tagId, churchId, assignedAt: now })
      .run();
    const fieldId = id();
    db.insert(schema.customFieldDefinitions)
      .values({
        id: fieldId,
        churchId,
        key: 'golongan_darah',
        label: 'Golongan darah',
        type: 'select',
        options: ['A', 'B', 'AB', 'O'],
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.customFieldValues)
      .values({ personId: child, fieldId, churchId, value: 'O', updatedAt: now })
      .run();
    db.insert(schema.personPrivacySettings)
      .values({ personId: child, churchId, showPhone: false, updatedAt: now })
      .run();
    db.insert(schema.groupJoinRequests)
      .values({
        id: id(),
        churchId,
        groupId: s.otherGroup.id,
        personId: s.memberPerson.id,
        requestedBy: s.member.user.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // comms
    db.insert(schema.announcementAudienceRoles)
      .values({ announcementId, roleId: roleId!, churchId })
      .run();
    db.insert(schema.announcementReads)
      .values({ announcementId, userId: s.member.user.id, churchId, readAt: now })
      .run();
    db.insert(schema.eventRegistrations)
      .values({
        id: id(),
        churchId,
        eventId,
        personId: child,
        status: 'waitlisted',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.calendarFeedTokens)
      .values({
        id: id(),
        churchId,
        userId: ownerId,
        tokenHash: hashToken(generateToken()),
        sources: ['events'],
        createdAt: now,
      })
      .run();
    db.insert(schema.bulletins)
      .values({
        id: id(),
        churchId,
        title: 'Warta Jemaat',
        issueDate: today,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // worship
    const serviceTypeId = id();
    db.insert(schema.serviceTypes)
      .values({
        id: serviceTypeId,
        churchId,
        name: 'Ibadah Umum 1',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const serviceId = id();
    db.insert(schema.worshipServices)
      .values({
        id: serviceId,
        churchId,
        serviceTypeId,
        title: 'Minggu Adven I',
        startsAt: now,
        scriptureReadings: ['Yesaya 40:1-11'],
        attendanceSessionId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const songId = id();
    db.insert(schema.songs)
      .values({
        id: songId,
        churchId,
        title: 'Haleluya, Pujilah',
        hymnal: 'KJ',
        hymnalNumber: '1',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.liturgyItems)
      .values({
        id: id(),
        churchId,
        serviceId,
        position: 0,
        type: 'song',
        title: 'Nyanyian pembuka',
        songId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const teamId = id();
    db.insert(schema.servingTeams)
      .values({ id: teamId, churchId, name: 'Pemusik', createdAt: now, updatedAt: now })
      .run();
    const positionId = id();
    db.insert(schema.servingPositions)
      .values({ id: positionId, churchId, teamId, name: 'Pianis', createdAt: now })
      .run();
    const teamMemberId = id();
    db.insert(schema.servingTeamMembers)
      .values({
        id: teamMemberId,
        churchId,
        teamId,
        personId: guardian,
        role: 'leader',
        joinedAt: now,
      })
      .run();
    db.insert(schema.servingMemberPositions).values({ teamMemberId, positionId, churchId }).run();
    db.insert(schema.rosterAssignments)
      .values({
        id: id(),
        churchId,
        serviceId,
        teamId,
        positionId,
        personId: guardian,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.volunteerBlockouts)
      .values({
        id: id(),
        churchId,
        personId: guardian,
        startDate: today,
        endDate: today,
        createdAt: now,
      })
      .run();

    // care
    const caseId = id();
    db.insert(schema.careCases)
      .values({
        id: caseId,
        churchId,
        personId: child,
        category: 'hospital',
        confidentiality: 'confidential',
        title: 'Kunjungan RS',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.careCaseCaregivers)
      .values({ caseId, userId: ownerId, churchId, assignedAt: now })
      .run();
    db.insert(schema.careNotes)
      .values({ id: id(), churchId, caseId, body: 'Catatan', createdAt: now, updatedAt: now })
      .run();
    const visitId = id();
    db.insert(schema.careVisits)
      .values({
        id: visitId,
        churchId,
        caseId,
        personId: child,
        visitDate: today,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.careVisitVisitors).values({ visitId, personId: guardian, churchId }).run();
    const prayerId = id();
    db.insert(schema.prayerRequests)
      .values({
        id: prayerId,
        churchId,
        title: 'Kesembuhan',
        body: 'Mohon doa',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.prayerRequestPrayers)
      .values({ requestId: prayerId, userId: ownerId, churchId, lastPrayedAt: now })
      .run();
    const followUpId = id();
    db.insert(schema.visitorFollowUps)
      .values({
        id: followUpId,
        churchId,
        personId: s.bob.id,
        stageChangedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const taskId = id();
    db.insert(schema.careTasks)
      .values({
        id: taskId,
        churchId,
        title: 'Telepon',
        followUpId,
        dueDate: today,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.absenceAlerts)
      .values({
        id: id(),
        churchId,
        personId: child,
        streak: 3,
        careTaskId: taskId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.dashboardPreferences)
      .values({ userId: ownerId, churchId, hiddenWidgets: ['birthdays'], updatedAt: now })
      .run();
    db.insert(schema.diakoniaAid)
      .values({
        id: id(),
        churchId,
        householdId,
        category: 'food',
        form: 'goods',
        givenAt: today,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // records
    const recordId = id();
    db.insert(schema.registryRecords)
      .values({
        id: recordId,
        churchId,
        type: 'baptism',
        subtype: 'infant',
        year: 2026,
        sequence: 1,
        number: 'B/2026/001',
        date: today,
        details: { birthPlace: 'Jakarta' },
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.registryRecordPeople)
      .values({
        id: id(),
        churchId,
        recordId,
        personId: child,
        name: 'Alice Smith',
        role: 'subject',
      })
      .run();

    // finance: references between finance rows use NO ACTION, yet the church still cascades.
    const fundId = id();
    db.insert(schema.financeFunds)
      .values({ id: fundId, churchId, name: 'Kas Umum', createdAt: now, updatedAt: now })
      .run();
    const accountId = id();
    const bankId = id();
    db.insert(schema.financeAccounts)
      .values([
        {
          id: accountId,
          churchId,
          name: 'Kas Tunai',
          type: 'cash',
          openingDate: today,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: bankId,
          churchId,
          name: 'Rekening BCA',
          type: 'bank',
          openingBalance: 5_000_000,
          openingDate: today,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    const incomeId = id();
    const expenseCategoryId = id();
    db.insert(schema.financeCategories)
      .values([
        {
          id: incomeId,
          churchId,
          kind: 'income',
          name: 'Persembahan Ibadah',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: expenseCategoryId,
          churchId,
          kind: 'expense',
          name: 'Operasional',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    db.insert(schema.financePeriods)
      .values({
        id: id(),
        churchId,
        year: 2025,
        month: 12,
        status: 'closed',
        closedBy: ownerId,
        closedAt: now,
      })
      .run();
    const batchId = id();
    db.insert(schema.offeringBatches)
      .values({
        id: batchId,
        churchId,
        serviceDate: today,
        worshipServiceId: serviceId,
        accountId,
        status: 'submitted',
        totalAmount: 1_250_000,
        counter1UserId: ownerId,
        counter2Name: 'Diaken Budi',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.offeringBatchLines)
      .values({
        id: id(),
        churchId,
        batchId,
        fundId,
        categoryId: incomeId,
        method: 'cash',
        amount: 1_250_000,
        denominations: { '100000': 12, '50000': 1 },
      })
      .run();
    db.insert(schema.financeEntries)
      .values({
        id: id(),
        churchId,
        entryDate: today,
        accountId,
        fundId,
        categoryId: incomeId,
        amount: 1_250_000,
        description: 'Persembahan Ibadah Umum',
        sourceType: 'offering',
        sourceId: batchId,
        createdAt: now,
      })
      .run();
    const campaignId = id();
    db.insert(schema.financeCampaigns)
      .values({
        id: campaignId,
        churchId,
        name: 'Renovasi',
        fundId,
        targetAmount: 100_000_000,
        startDate: today,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.financePledges)
      .values({
        id: id(),
        churchId,
        campaignId,
        personId: guardian,
        amount: 1_000_000,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.financeContributions)
      .values({
        id: id(),
        churchId,
        personId: guardian,
        kind: 'tithe',
        fundId,
        accountId: bankId,
        method: 'transfer',
        amount: 500_000,
        receivedAt: today,
        receiptNumber: 'R/2026/0001',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.expenseRequests)
      .values({
        id: id(),
        churchId,
        title: 'Listrik Oktober',
        categoryId: expenseCategoryId,
        fundId,
        amount: 750_000,
        requestedBy: s.admin.user.id,
        attachmentUrls: ['https://example.com/tagihan.pdf'],
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.financeBudgets)
      .values({
        id: id(),
        churchId,
        year: 2026,
        categoryId: expenseCategoryId,
        amount: 9_000_000,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.financeTransfers)
      .values({
        id: id(),
        churchId,
        fromAccountId: accountId,
        toAccountId: bankId,
        fundId,
        amount: 1_000_000,
        transferDate: today,
        createdAt: now,
      })
      .run();

    // facilities
    const resourceId = id();
    db.insert(schema.facilityResources)
      .values({
        id: resourceId,
        churchId,
        name: 'Aula Serbaguna',
        kind: 'hall',
        features: ['Proyektor'],
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const bookingId = id();
    db.insert(schema.facilityBookings)
      .values({
        id: bookingId,
        churchId,
        resourceId,
        title: 'Latihan paduan suara',
        startsAt: now,
        endsAt: now,
        recurrence: 'weekly',
        recurrenceUntil: today,
        requestedBy: ownerId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.facilityBookingExceptions)
      .values({ bookingId, occurrenceDate: today, churchId, createdAt: now })
      .run();
    const assetId = id();
    db.insert(schema.inventoryAssets)
      .values({
        id: assetId,
        churchId,
        code: 'INV-0001',
        name: 'Proyektor Epson',
        resourceId,
        acquisitionValue: 6_500_000,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.assetLoans)
      .values({
        id: id(),
        churchId,
        assetId,
        borrowerPersonId: guardian,
        borrowerName: 'Bob Jones',
        checkedOutAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.assetMaintenance)
      .values({
        id: id(),
        churchId,
        assetId,
        date: today,
        description: 'Ganti lampu',
        createdAt: now,
      })
      .run();

    // checkin
    const classId = id();
    db.insert(schema.checkinClasses)
      .values({
        id: classId,
        churchId,
        name: 'Kelas Kecil',
        minAge: 4,
        maxAge: 6,
        resourceId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.checkinClassTeachers)
      .values({ id: id(), churchId, classId, personId: s.memberPerson.id, assignedAt: now })
      .run();
    const sessionId = id();
    db.insert(schema.checkinSessions)
      .values({
        id: sessionId,
        churchId,
        name: 'Sekolah Minggu',
        date: today,
        worshipServiceId: serviceId,
        attendanceSessionId,
        openedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.checkinChildProfiles)
      .values({ personId: child, churchId, defaultClassId: classId, updatedAt: now })
      .run();
    db.insert(schema.checkinChildAlerts)
      .values({
        id: id(),
        churchId,
        personId: child,
        kind: 'allergy',
        description: 'Kacang',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.checkinAuthorizedPickups)
      .values({
        id: id(),
        churchId,
        childPersonId: child,
        name: 'Oma',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.checkins)
      .values({
        id: id(),
        churchId,
        sessionId,
        classId,
        childPersonId: child,
        guardianPersonId: guardian,
        securityCode: generateCode(),
        checkedInAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const empty = CHURCH_TABLES.filter((table) => countForChurch(table, churchId) === 0).map(
      getTableName,
    );
    expect(empty).toEqual([]);

    // Confidential columns hold ciphertext only; reads through Drizzle see the plain text.
    for (const { table, column } of ENCRYPTED_COLUMNS) {
      const values = db.all<{ value: string | null }>(
        sql`select ${sql.identifier(column)} as value from ${sql.identifier(table)}`,
      );
      for (const { value } of values) {
        if (value !== null) expect(value).toStartWith('enc1:');
      }
    }

    db.delete(schema.churches).where(eq(schema.churches.id, churchId)).run();

    const remaining = CHURCH_TABLES.filter((table) => countForChurch(table, churchId) > 0).map(
      getTableName,
    );
    expect(remaining).toEqual([]);
  });

  it('enforces the uniqueness rules the modules rely on', async () => {
    const owner = await t.register('Unique owner');
    const church = await t.createChurch(owner.token, 'Unique Church');
    const person = await t.createPerson(owner.token, church.id, { firstName: 'Ani' });
    const now = nowIso();
    const today = now.slice(0, 10);
    const group = await t.createGroup(owner.token, church.id, { name: 'Komisi Pemuda' });

    const request = (status: 'pending' | 'declined') => ({
      id: newId(),
      churchId: church.id,
      groupId: group.id,
      personId: person.id,
      status,
      createdAt: now,
      updatedAt: now,
    });
    db.insert(schema.groupJoinRequests).values(request('pending')).run();
    db.insert(schema.groupJoinRequests).values(request('declined')).run();
    expect(() => db.insert(schema.groupJoinRequests).values(request('pending')).run()).toThrow();

    const record = (sequence: number, number: string) => ({
      id: newId(),
      churchId: church.id,
      type: 'sidi' as const,
      year: 2026,
      sequence,
      number,
      date: today,
      createdAt: now,
      updatedAt: now,
    });
    db.insert(schema.registryRecords).values(record(1, 'S/2026/001')).run();
    expect(() => db.insert(schema.registryRecords).values(record(1, 'S/2026/999')).run()).toThrow();
    expect(() => db.insert(schema.registryRecords).values(record(2, 'S/2026/001')).run()).toThrow();

    const resourceId = newId();
    db.insert(schema.facilityResources)
      .values({
        id: resourceId,
        churchId: church.id,
        name: 'Proyektor',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const assetId = newId();
    db.insert(schema.inventoryAssets)
      .values({
        id: assetId,
        churchId: church.id,
        code: 'INV-0001',
        name: 'Proyektor',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const loan = (returnedAt: string | null) => ({
      id: newId(),
      churchId: church.id,
      assetId,
      borrowerName: 'Ani',
      checkedOutAt: now,
      returnedAt,
      createdAt: now,
      updatedAt: now,
    });
    db.insert(schema.assetLoans).values(loan(now)).run();
    db.insert(schema.assetLoans).values(loan(null)).run();
    expect(() => db.insert(schema.assetLoans).values(loan(null)).run()).toThrow();

    // A fund with ledger entries cannot be deleted on its own; it is deactivated instead.
    const fundId = newId();
    const accountId = newId();
    db.insert(schema.financeFunds)
      .values({ id: fundId, churchId: church.id, name: 'Kas Umum', createdAt: now, updatedAt: now })
      .run();
    db.insert(schema.financeAccounts)
      .values({
        id: accountId,
        churchId: church.id,
        name: 'Kas',
        type: 'cash',
        openingDate: today,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.financeEntries)
      .values({
        id: newId(),
        churchId: church.id,
        entryDate: today,
        accountId,
        fundId,
        amount: 10_000,
        description: 'Persembahan',
        sourceType: 'adjustment',
        createdAt: now,
      })
      .run();
    expect(() =>
      db.delete(schema.financeFunds).where(eq(schema.financeFunds.id, fundId)).run(),
    ).toThrow();
  });

  it('removes account-security rows with the account', async () => {
    const account = await t.register('Security user');
    const userId = account.user.id;
    const now = nowIso();
    db.insert(schema.userTwoFactor)
      .values({ userId, secretEncrypted: 'v1:ciphertext', createdAt: now, updatedAt: now })
      .run();
    db.insert(schema.userRecoveryCodes)
      .values({ id: newId(), userId, codeHash: hashToken('ABCDEFGHJK'), createdAt: now })
      .run();
    db.insert(schema.twoFactorChallenges)
      .values({
        id: newId(),
        userId,
        tokenHash: hashToken(generateToken()),
        expiresAt: now,
        createdAt: now,
      })
      .run();
    db.insert(schema.loginEvents)
      .values({
        id: newId(),
        userId,
        email: account.user.email,
        outcome: 'success',
        createdAt: now,
      })
      .run();
    db.insert(schema.passwordResetTokens)
      .values({
        id: newId(),
        userId,
        tokenHash: hashToken(generateToken()),
        expiresAt: now,
        createdAt: now,
      })
      .run();
    for (const table of USER_TABLES) expect(countForUser(table, userId)).toBe(1);

    db.delete(schema.users).where(eq(schema.users.id, userId)).run();
    for (const table of USER_TABLES) expect(countForUser(table, userId)).toBe(0);
  });

  it('wires every module router and honours the module toggles', async () => {
    const owner = await t.register('Wiring owner');
    const church = await t.createChurch(owner.token, 'Wiring Church');
    const base = `/api/churches/${church.id}`;

    for (const [moduleId, path] of Object.entries(MODULE_PATHS)) {
      const status = await t.request('GET', `${base}/${path}/status`, { token: owner.token });
      expect(status.status).toBe(200);
      expect(status.json.module).toBe(moduleId);
      expect(Array.isArray(status.json.permissions)).toBe(true);
    }
    const finance = await t.request('GET', `${base}/finance/status`, { token: owner.token });
    expect(finance.json.permissions).toContain('finance.approve');

    const stranger = await t.register('Wiring stranger');
    const denied = await t.request('GET', `${base}/finance/status`, { token: stranger.token });
    expect(denied.status).toBe(403);

    const off = await t.request('PATCH', `${base}/modules`, {
      token: owner.token,
      body: { modules: Object.fromEntries(OPTIONAL_MODULE_IDS.map((id) => [id, false])) },
    });
    expect(off.status).toBe(200);
    for (const moduleId of OPTIONAL_MODULE_IDS) {
      const status = await t.request('GET', `${base}/${MODULE_PATHS[moduleId]}/status`, {
        token: owner.token,
      });
      expect(status.status).toBe(403);
      expect(status.json.error.code).toBe('MODULE_DISABLED');
    }
    const required = await t.request('GET', `${base}/directory/status`, { token: owner.token });
    expect(required.status).toBe(200);
  });
});
