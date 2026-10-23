import type { Database } from 'bun:sqlite';
import { getTableColumns, getTableName, is, type Table } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';

/**
 * Inserts many rows with one prepared statement inside a transaction: about ten times faster
 * than Drizzle's batched inserts, for seed scripts and benchmarks (scripts/seed-large.ts).
 * Column names come from the Drizzle table, so a renamed column fails loudly. JSON and boolean
 * columns are encoded the way Drizzle stores them. Every row must have the keys of the first.
 * Not for request handlers: it skips Drizzle's defaults and `$type` checks. Returns the table name.
 */
export function insertRows(
  sqlite: Database,
  table: Table,
  rows: readonly Record<string, unknown>[],
): string {
  const tableName = getTableName(table);
  const first = rows[0];
  if (!first) return tableName;
  if (!is(table, SQLiteTable)) throw new Error('Not a SQLite table');
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const keys = Object.keys(first);
  const names = keys.map((key) => {
    const column = columns[key];
    if (!column) throw new Error(`${tableName} has no column ${key}`);
    return `"${column.name}"`;
  });
  const statement = sqlite.prepare(
    `insert into "${tableName}" (${names.join(', ')}) values (${keys.map(() => '?').join(', ')})`,
  );
  const encode = (value: unknown): string | number | null => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'object') return JSON.stringify(value);
    return value as string | number;
  };
  sqlite.transaction(() => {
    for (const row of rows) statement.run(...keys.map((key) => encode(row[key])));
  })();
  return tableName;
}
