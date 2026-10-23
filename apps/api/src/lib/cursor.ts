import { sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { validationError } from './errors';

/*
 * Keyset ("cursor") paging for the largest tables: the audit log, notifications, the ledger and
 * attendance sessions. A cursor is the sort key of the last row a page returned; the next page
 * starts strictly after it with a row-value comparison the index answers directly, so page 1000
 * costs what page 1 costs and rows written meanwhile are neither skipped nor repeated. Cursors
 * are opaque to clients (base64url JSON) but carry no secret: they only narrow a query the
 * caller may run anyway.
 */

export type CursorValue = string | number;

export const encodeCursor = (values: readonly CursorValue[]): string =>
  Buffer.from(JSON.stringify(values)).toString('base64url');

/** The sort key in a cursor; 422 VALIDATION when it is not one this list issued. */
export function decodeCursor(cursor: string, length: number): CursorValue[] {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === length &&
      parsed.every((value) => typeof value === 'string' || typeof value === 'number')
    ) {
      return parsed as CursorValue[];
    }
  } catch {
    // Reported below.
  }
  throw validationError('Invalid request query', [
    { path: 'cursor', message: 'This cursor does not belong to this list' },
  ]);
}

/** Rows after the cursor in an ORDER BY on `columns`, all descending or all ascending. */
export const afterCursor = (
  columns: readonly SQLiteColumn[],
  values: readonly CursorValue[],
  direction: 'asc' | 'desc',
): SQL =>
  sql`(${sql.join([...columns], sql`, `)}) ${direction === 'desc' ? sql`<` : sql`>`} (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;

/**
 * One keyset page from rows fetched with `limit + 1`: the extra row only tells whether another
 * page follows, and `nextCursor` is the key of the last row returned.
 */
export function keysetPage<T>(
  rows: readonly T[],
  limit: number,
  keyOf: (row: T) => CursorValue[],
): { rows: T[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    rows: page,
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(keyOf(last)) : null,
  };
}
