import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { LIMITS } from '@tatagereja/shared';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/client';
import {
  attendanceRecords,
  attendanceSessions,
  auditLogs,
  groups,
  notifications,
} from '../src/db/schema';
import { newId } from '../src/lib/tokens';
import { absenceStreaksOf } from '../src/services/attendance';
import { createTestApp, seedChurch } from './helpers';

/*
 * Bounded lists at church scale: page size limits, the hard cap on unpaged lists, keyset paging
 * of the largest tables, and the indexed absence streaks against the reference algorithm.
 */

type Seed = Awaited<ReturnType<typeof seedChurch>>;

const iso = (offsetMinutes: number) =>
  new Date(Date.UTC(2026, 0, 1) + offsetMinutes * 60_000).toISOString();

describe('page sizes', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Seed;

  beforeAll(async () => {
    s = await seedChurch(t);
  });

  it('refuses a page larger than the list allows', async () => {
    for (const path of [
      `/api/churches/${s.church.id}/people?limit=${LIMITS.pageSizeMax + 1}`,
      `/api/churches/${s.church.id}/audit-logs?limit=${LIMITS.auditPageSizeMax + 1}`,
      `/api/churches/${s.church.id}/attendance/sessions?limit=${LIMITS.pageSizeMax + 1}`,
      `/api/churches/${s.church.id}/finance/entries?limit=${LIMITS.pageSizeMax + 1}`,
      `/api/notifications?limit=${LIMITS.pageSizeMax + 1}`,
      `/api/churches/${s.church.id}/worship/songs?limit=${LIMITS.pageSizeMax + 1}`,
    ]) {
      const response = await t.request('GET', path, { token: s.owner.token });
      expect(response.status, path).toBe(422);
    }
    const largest = await t.request(
      'GET',
      `/api/churches/${s.church.id}/people?limit=${LIMITS.pageSizeMax}`,
      { token: s.owner.token },
    );
    expect(largest.status).toBe(200);
  });

  it('caps lists that are not paged', async () => {
    const now = new Date().toISOString();
    t.db
      .insert(groups)
      .values(
        Array.from({ length: LIMITS.listMax + 5 }, (_, index) => ({
          id: newId(),
          churchId: s.church.id,
          name: `Kelompok ${String(index).padStart(4, '0')}`,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();
    const response = await t.request('GET', `/api/churches/${s.church.id}/groups`, {
      token: s.owner.token,
    });
    expect(response.status).toBe(200);
    expect(response.json.items.length).toBe(LIMITS.listMax);
  });
});

describe('keyset paging', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Seed;

  beforeAll(async () => {
    s = await seedChurch(t);
    // Rows with shared timestamps, so the id tie-break is exercised.
    t.db
      .insert(auditLogs)
      .values(
        Array.from({ length: 23 }, (_, index) => ({
          id: newId(),
          churchId: s.church.id,
          actorUserId: s.owner.user.id,
          module: 'core',
          action: 'test.keyset',
          entityType: 'test',
          summary: `Entry ${index}`,
          createdAt: iso(Math.floor(index / 3)),
        })),
      )
      .run();
    t.db
      .insert(notifications)
      .values(
        Array.from({ length: 17 }, (_, index) => ({
          id: newId(),
          churchId: s.church.id,
          userId: s.member.user.id,
          type: 'test.keyset',
          title: `Pemberitahuan ${index}`,
          createdAt: iso(Math.floor(index / 2)),
        })),
      )
      .run();
  });

  /** Follows `nextCursor` from the first page to the end; returns every id in order. */
  const walk = async (path: string, token: string, limit: number) => {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 50; page += 1) {
      const separator = path.includes('?') ? '&' : '?';
      const response: { status: number; json: any } = await t.request(
        'GET',
        `${path}${separator}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { token },
      );
      expect(response.status).toBe(200);
      ids.push(...response.json.items.map((item: { id: string }) => item.id));
      cursor = response.json.nextCursor;
      if (!cursor) return { ids, total: response.json.total as number };
    }
    throw new Error('Keyset paging did not end');
  };

  it('pages the audit log in the same order as offsets, without gaps or repeats', async () => {
    const path = `/api/churches/${s.church.id}/audit-logs?action=test.keyset`;
    const all = await t.request('GET', `${path}&limit=200`, { token: s.owner.token });
    expect(all.json.nextCursor).toBeNull();
    const walked = await walk(path, s.owner.token, 4);
    expect(walked.ids).toEqual(all.json.items.map((item: { id: string }) => item.id));
    expect(walked.ids.length).toBe(23);
    expect(new Set(walked.ids).size).toBe(23);
    expect(walked.total).toBe(23);
  });

  it('continues after the cursor when newer rows arrive in between', async () => {
    const path = `/api/notifications?churchId=${s.church.id}`;
    const first = await t.request('GET', `${path}&limit=5`, { token: s.member.token });
    expect(first.json.nextCursor).toEqual(expect.any(String));
    t.db
      .insert(notifications)
      .values({
        id: newId(),
        churchId: s.church.id,
        userId: s.member.user.id,
        type: 'test.keyset',
        title: 'Terbaru',
        createdAt: new Date().toISOString(),
      })
      .run();
    const second = await t.request(
      'GET',
      `${path}&limit=5&cursor=${encodeURIComponent(first.json.nextCursor)}`,
      { token: s.member.token },
    );
    const firstIds = first.json.items.map((item: { id: string }) => item.id);
    const secondIds = second.json.items.map((item: { id: string }) => item.id);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
    // The new row is newer than the cursor, so it is not on the following pages.
    expect(second.json.items.some((item: { title: string }) => item.title === 'Terbaru')).toBe(
      false,
    );
  });

  it('pages attendance sessions by date both ways', async () => {
    const base = `/api/churches/${s.church.id}/attendance/sessions`;
    for (let index = 0; index < 7; index += 1) {
      const created = await t.request('POST', base, {
        token: s.owner.token,
        body: { title: `Ibadah ${index}`, sessionAt: iso(index * 60) },
      });
      expect(created.status).toBe(201);
    }
    for (const sort of ['recent', 'oldest']) {
      const all = await t.request('GET', `${base}?sort=${sort}&limit=200`, {
        token: s.owner.token,
      });
      const walked = await walk(`${base}?sort=${sort}`, s.owner.token, 3);
      expect(walked.ids).toEqual(all.json.items.map((item: { id: string }) => item.id));
    }
    const byTitle = await t.request('GET', `${base}?sort=title&cursor=abc`, {
      token: s.owner.token,
    });
    expect(byTitle.status).toBe(422);
  });

  it('refuses a cursor it did not issue', async () => {
    for (const cursor of ['not-a-cursor', Buffer.from('[1]').toString('base64url'), 'e30']) {
      const response = await t.request(
        'GET',
        `/api/churches/${s.church.id}/audit-logs?cursor=${cursor}`,
        { token: s.owner.token },
      );
      expect(response.status).toBe(422);
      expect(response.json.error.issues[0].path).toBe('cursor');
    }
  });

  it('pages the ledger with a cursor', async () => {
    const setup = await t.request('POST', `/api/churches/${s.church.id}/finance/setup/defaults`, {
      token: s.owner.token,
      body: { openingDate: '2025-01-01' },
    });
    expect(setup.status).toBe(200);
    for (let index = 0; index < 5; index += 1) {
      const posted = await t.request('POST', `/api/churches/${s.church.id}/finance/adjustments`, {
        token: s.owner.token,
        body: {
          entryDate: `2025-0${1 + (index % 3)}-15`,
          accountId: setup.json.accounts[0].id,
          fundId: setup.json.funds[0].id,
          amount: 10_000 * (index + 1),
          description: `Penyesuaian ${index}`,
        },
      });
      expect(posted.status).toBe(201);
    }
    const path = `/api/churches/${s.church.id}/finance/entries`;
    const all = await t.request('GET', `${path}?limit=200`, { token: s.owner.token });
    const walked = await walk(path, s.owner.token, 2);
    expect(walked.ids).toEqual(all.json.items.map((item: { id: string }) => item.id));
    expect(walked.ids.length).toBe(5);
  });
});

/** The streak rules on marks sorted newest first: the reference the SQL must match. */
function referenceStreaks(marks: { personId: string; sessionAt: string; status: string }[]) {
  const byPerson = new Map<string, typeof marks>();
  for (const mark of [...marks].sort((a, b) => b.sessionAt.localeCompare(a.sessionAt))) {
    byPerson.set(mark.personId, [...(byPerson.get(mark.personId) ?? []), mark]);
  }
  const result = new Map<
    string,
    { streak: number; lastPresentAt: string | null; lastAbsentAt: string }
  >();
  for (const [personId, list] of byPerson) {
    let streak = 0;
    let lastAbsentAt: string | null = null;
    let lastPresentAt: string | null = null;
    for (const mark of list) {
      if (mark.status === 'excused') continue;
      if (mark.status === 'present') {
        lastPresentAt = mark.sessionAt;
        break;
      }
      streak += 1;
      lastAbsentAt ??= mark.sessionAt;
    }
    if (streak > 0 && lastAbsentAt) result.set(personId, { streak, lastPresentAt, lastAbsentAt });
  }
  return result;
}

describe('absence streaks', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Seed;

  beforeAll(async () => {
    s = await seedChurch(t);
  });

  it('match the reference algorithm on random attendance, with and without a group scope', async () => {
    let state = 42;
    const random = () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
    const personIds: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      personIds.push(
        (await t.createPerson(s.owner.token, s.church.id, { firstName: `Jemaat ${index}` })).id,
      );
    }
    const now = new Date().toISOString();
    const marks: { personId: string; sessionAt: string; status: string; groupId: string | null }[] =
      [];
    for (let index = 0; index < 30; index += 1) {
      const sessionId = newId();
      const sessionAt = iso(index * 7 * 24 * 60);
      const groupId = index % 3 === 0 ? s.group.id : null;
      t.db
        .insert(attendanceSessions)
        .values({
          id: sessionId,
          churchId: s.church.id,
          groupId,
          title: 'Ibadah',
          sessionAt,
          createdBy: s.owner.user.id,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      for (const personId of personIds) {
        const roll = random();
        if (roll < 0.2) continue;
        const status = roll < 0.55 ? 'present' : roll < 0.9 ? 'absent' : 'excused';
        marks.push({ personId, sessionAt, status, groupId });
        t.db
          .insert(attendanceRecords)
          .values({
            id: newId(),
            sessionId,
            personId,
            churchId: s.church.id,
            status: status as 'present' | 'absent' | 'excused',
            sessionAt,
            recordedBy: s.owner.user.id,
            recordedAt: now,
          })
          .run();
      }
    }
    const compare = (scoped: boolean) => {
      const expected = referenceStreaks(
        marks.filter((mark) => !scoped || mark.groupId === s.group.id),
      );
      const actual = absenceStreaksOf(t.db, s.church.id, scoped ? { groupIds: [s.group.id] } : {});
      expect(new Map(actual.map(({ personId, ...rest }) => [personId, rest]))).toEqual(expected);
      expect(expected.size).toBeGreaterThan(0);
    };
    compare(false);
    compare(true);
    const one = absenceStreaksOf(t.db, s.church.id, { personIds: [personIds[0]!] });
    expect(one.every((row) => row.personId === personIds[0])).toBe(true);
  });

  it('follow a session moved to another time', async () => {
    const base = `/api/churches/${s.church.id}/attendance`;
    const person = await t.createPerson(s.owner.token, s.church.id, { firstName: 'Pindah' });
    const sessions: string[] = [];
    for (const at of [iso(-3000), iso(-2000), iso(-1000)]) {
      const created = await t.request('POST', `${base}/sessions`, {
        token: s.owner.token,
        body: { title: 'Ibadah', sessionAt: at },
      });
      sessions.push(created.json.session.id);
    }
    const mark = (sessionId: string, status: string) =>
      t.request('PUT', `${base}/sessions/${sessionId}/records`, {
        token: s.owner.token,
        body: { records: [{ personId: person.id, status, note: null }] },
      });
    await mark(sessions[0]!, 'absent');
    await mark(sessions[1]!, 'absent');
    await mark(sessions[2]!, 'present');
    expect(absenceStreaksOf(t.db, s.church.id, { personIds: [person.id] })).toEqual([]);

    // The present session moves before the absences: the two absences are now a streak.
    const moved = await t.request('PATCH', `${base}/sessions/${sessions[2]}`, {
      token: s.owner.token,
      body: { title: 'Ibadah', sessionAt: iso(-4000), notes: null },
    });
    expect(moved.status).toBe(200);
    const [streak] = absenceStreaksOf(t.db, s.church.id, { personIds: [person.id] });
    expect(streak?.streak).toBe(2);
    expect(streak?.lastPresentAt).toBe(iso(-4000));
  });
});

describe('copied session times', () => {
  it('are filled in when the database opens', () => {
    const path = join(tmpdir(), `tatagereja-backfill-${newId()}.db`);
    try {
      const first = openDatabase(path);
      const now = new Date().toISOString();
      first.sqlite.exec(`
        insert into users (id, email, name, password_hash, created_at, updated_at)
          values ('u1', 'a@example.com', 'A', 'x', '${now}', '${now}');
        insert into churches (id, name, owner_user_id, created_at, updated_at)
          values ('c1', 'Gereja', 'u1', '${now}', '${now}');
        insert into people (id, church_id, first_name, created_at, updated_at)
          values ('p1', 'c1', 'Jemaat', '${now}', '${now}');
        insert into attendance_sessions (id, church_id, title, session_at, created_by, created_at, updated_at)
          values ('s1', 'c1', 'Ibadah', '2025-05-04T02:00:00.000Z', 'u1', '${now}', '${now}');
        insert into attendance_records (id, session_id, person_id, church_id, status, recorded_by, recorded_at)
          values ('r1', 's1', 'p1', 'c1', 'present', 'u1', '${now}');
      `);
      expect(first.sqlite.query('select session_at from attendance_records').get()).toEqual({
        session_at: '',
      });
      first.close();
      const second = openDatabase(path);
      expect(second.sqlite.query('select session_at from attendance_records').get()).toEqual({
        session_at: '2025-05-04T02:00:00.000Z',
      });
      second.close();
    } finally {
      for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
    }
  });
});
