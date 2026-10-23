import { is } from 'drizzle-orm';
import { SQLiteTable, getTableConfig, type SQLiteColumn } from 'drizzle-orm/sqlite-core';
import * as schema from '../../db/schema';

/*
 * Walks the Drizzle schema so exports, backups and account deletion keep covering the tables
 * other modules add later, without a hand-maintained list.
 */

export type TableInfo = {
  name: string;
  table: SQLiteTable;
  /** Column objects by SQL name. */
  columns: Map<string, SQLiteColumn>;
  /** Foreign keys to `users` that neither cascade nor set null (they block deleting a user). */
  blockingUserColumns: string[];
};

let cached: TableInfo[] | null = null;

export function schemaTables(): TableInfo[] {
  if (cached) return cached;
  cached = (Object.values(schema) as unknown[])
    .filter((value): value is SQLiteTable => is(value, SQLiteTable))
    .map((table) => {
      const config = getTableConfig(table);
      const blockingUserColumns = config.foreignKeys.flatMap((foreignKey) => {
        const reference = foreignKey.reference();
        if (reference.foreignTable !== schema.users) return [];
        const action = foreignKey.onDelete ?? 'no action';
        if (action === 'cascade' || action === 'set null' || action === 'set default') return [];
        return reference.columns.map((column) => column.name);
      });
      return {
        name: config.name,
        table,
        columns: new Map(config.columns.map((column) => [column.name, column])),
        blockingUserColumns,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return cached;
}

/** Tables holding church data (they carry `church_id`). */
export const churchTables = (): TableInfo[] =>
  schemaTables().filter((info) => info.columns.has('church_id'));

/**
 * Keys that are credentials and never leave the server, in exports or backups. Check-in
 * security codes release children at pickup, so they count as credentials too.
 */
const CREDENTIAL_KEY = /^(token|tokenHash|passwordHash|secretEncrypted|codeHash|securityCode)$/;

/** A copy of a row without credential fields. */
export const withoutCredentials = (row: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !CREDENTIAL_KEY.test(key)));
