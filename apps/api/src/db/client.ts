import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import * as schema from './schema';

export type Db = ReturnType<typeof createDrizzle>;
/** Either the database or a transaction handle: anything that can run queries. */
export type Queryable = BaseSQLiteDatabase<'sync', void, typeof schema>;

const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname;

function createDrizzle(client: Database) {
  return drizzle({ client, schema });
}

export type DatabaseHandle = {
  db: Db;
  sqlite: Database;
  close: () => void;
};

/**
 * Opens (or creates) the SQLite database, enables foreign keys and WAL mode,
 * and applies pending migrations.
 */
export function openDatabase(path: string): DatabaseHandle {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') {
    sqlite.exec('PRAGMA journal_mode = WAL;');
    sqlite.exec('PRAGMA busy_timeout = 5000;');
  }
  const db = createDrizzle(sqlite);
  migrate(db, { migrationsFolder });
  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
