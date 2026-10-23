import {
  HYMNALS,
  churchIdParamsSchema,
  churchParamsSchema,
  songInputSchema,
  songListQuerySchema,
  type Hymnal,
} from '@tatagereja/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  like,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { SongRow } from '../../db/schema';
import { liturgyItems, songs, worshipServices } from '../../db/schema';
import type { Deps } from '../../deps';
import { notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { canSeeDraftServices, ledTeamIdsOf, songUsage } from '../../services/worship';
import { loadSong } from './load';
import { toSong } from './serializers';

/** "KJ 3", "pkj 12a": a hymnal and its number typed in the search box. */
const HYMNAL_SEARCH = new RegExp(
  `^(${HYMNALS.filter((h) => h !== 'other').join('|')})\\s*(\\w+)$`,
  'i',
);

const auditFields = (row: SongRow) => ({
  title: row.title,
  author: row.author,
  defaultKey: row.defaultKey,
  tempo: row.tempo,
  tags: row.tags,
  ccliNumber: row.ccliNumber,
  hymnal: row.hymnal,
  hymnalNumber: row.hymnalNumber,
  isActive: row.isActive,
});

/** The song library: Kidung Jemaat, PKJ, NKB and the church's own songs. */
const { lyrics: _lyrics, ...songListColumns } = getTableColumns(songs);

export const songsRouter = (deps: Deps) => {
  const { db } = deps;

  const hydrate = (churchId: string, rows: SongRow[]) => {
    const usage = songUsage(
      db,
      churchId,
      rows.map((row) => row.id),
      nowIso(),
    );
    return rows.map((row) => toSong(row, usage.get(row.id)));
  };

  return new Elysia({ prefix: '/churches/:churchId/worship/songs' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, query }) => {
        const now = nowIso();
        const conditions: SQL[] = [eq(songs.churchId, church.id)];
        if (query.q) {
          const hymnal = HYMNAL_SEARCH.exec(query.q.trim());
          const pattern = likePattern(query.q);
          const text = or(
            like(songs.title, pattern),
            like(songs.author, pattern),
            like(songs.ccliNumber, pattern),
            like(songs.lyrics, pattern),
            hymnal
              ? and(
                  eq(songs.hymnal, hymnal[1]!.toUpperCase() as Hymnal),
                  eq(songs.hymnalNumber, hymnal[2]!),
                )
              : like(songs.hymnalNumber, pattern),
          );
          if (text) conditions.push(text);
        }
        if (query.hymnal) conditions.push(eq(songs.hymnal, query.hymnal));
        if (query.tag) {
          conditions.push(
            sql`exists (select 1 from json_each(${songs.tags}) where json_each.value = ${query.tag})`,
          );
        }
        const where = and(...conditions);
        const total = db.select({ value: count() }).from(songs).where(where).get()?.value ?? 0;
        // Correlated subqueries over the liturgy of past services that were not cancelled.
        const usedIn = sql`from liturgy_items li inner join worship_services ws on ws.id = li.service_id where li.song_id = ${songs.id} and ws.status != 'cancelled' and ws.starts_at <= ${now}`;
        const lastUsed = sql`(select max(ws.starts_at) ${usedIn})`;
        const useCount = sql`(select count(distinct li.service_id) ${usedIn})`;
        const order =
          query.sort === 'last_used'
            ? [sql`${lastUsed} is null`, desc(lastUsed), asc(songs.title)]
            : query.sort === 'most_used'
              ? [desc(useCount), asc(songs.title)]
              : [asc(sql`${songs.title} collate nocase`)];
        // Lyrics stay out of the list (a page of hymns is mostly lyrics); the detail has them.
        const rows = db
          .select(songListColumns)
          .from(songs)
          .where(where)
          .orderBy(...order)
          .limit(query.limit)
          .offset(offsetOf(query))
          .all()
          .map((row) => ({ ...row, lyrics: null }));
        return { items: hydrate(church.id, rows), total, page: query.page, limit: query.limit };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchParamsSchema,
        query: songListQuerySchema,
      },
    )
    .get(
      '/tags',
      ({ church }) => ({
        items: db
          .all<{ tag: string; count: number }>(
            sql`select json_each.value as tag, count(*) as count from ${songs}, json_each(${songs.tags}) where ${songs.churchId} = ${church.id} group by json_each.value order by count desc, tag asc`,
          )
          .map((row) => ({ tag: String(row.tag), count: Number(row.count) })),
      }),
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchParamsSchema,
      },
    )
    .post(
      '/',
      ({ church, audit, body, set }) => {
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(songs)
            .values({
              id: newId(),
              churchId: church.id,
              ...body,
              tags: [...new Set(body.tags)],
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'song.create',
            entityType: 'song',
            entityId: created.id,
            summary: `Added the song ${created.title}`,
            after: auditFields(created),
          });
          return created;
        });
        set.status = 201;
        return { song: toSong(row) };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchParamsSchema,
        body: songInputSchema,
      },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const row = loadSong(db, church.id, params.id);
        const drafts = canSeeDraftServices(access, ledTeamIdsOf(db, church.id, access.personId));
        const usage = db
          .selectDistinct({
            serviceId: worshipServices.id,
            title: worshipServices.title,
            startsAt: worshipServices.startsAt,
          })
          .from(liturgyItems)
          .innerJoin(worshipServices, eq(worshipServices.id, liturgyItems.serviceId))
          .where(
            and(
              eq(liturgyItems.churchId, church.id),
              eq(liturgyItems.songId, row.id),
              ne(worshipServices.status, 'cancelled'),
              drafts ? undefined : ne(worshipServices.status, 'draft'),
            ),
          )
          .orderBy(desc(worshipServices.startsAt))
          .limit(50)
          .all();
        return { song: hydrate(church.id, [row])[0]!, usage };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
      },
    )
    .patch(
      '/:id',
      ({ church, audit, params, body }) => {
        const before = loadSong(db, church.id, params.id);
        const row = db.transaction((tx) => {
          const updated = tx
            .update(songs)
            .set({ ...body, tags: [...new Set(body.tags)], updatedAt: nowIso() })
            .where(eq(songs.id, before.id))
            .returning()
            .get();
          if (!updated) throw notFound('Song');
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'song.update',
            entityType: 'song',
            entityId: before.id,
            summary: `Updated the song ${updated.title}`,
            ...changes(auditFields(before), auditFields(updated)),
          });
          return updated;
        });
        return { song: hydrate(church.id, [row])[0]! };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchIdParamsSchema,
        body: songInputSchema,
      },
    )
    .delete(
      '/:id',
      ({ church, audit, params }) => {
        const row = loadSong(db, church.id, params.id);
        // Liturgy items keep their title; their song link is cleared (`on delete set null`).
        db.transaction((tx) => {
          tx.delete(songs).where(eq(songs.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'song.delete',
            entityType: 'song',
            entityId: row.id,
            summary: `Deleted the song ${row.title}`,
            before: auditFields(row),
          });
        });
        return { ok: true as const };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchIdParamsSchema,
      },
    );
};
