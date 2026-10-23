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
  /** Refreshes the query planner statistics where they drifted; cheap, run every few hours. */
  optimize: () => void;
  close: () => void;
};

/** How often a long-running server refreshes planner statistics (`PRAGMA optimize`). */
export const OPTIMIZE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Opens (or creates) the SQLite database and applies pending migrations. One connection serves
 * the whole process, so it is tuned for that:
 *  - WAL with `synchronous = NORMAL`: readers never wait for the writer, and a commit costs no
 *    fsync (only a checkpoint does). A power cut can lose the last commits, never corrupt.
 *  - a 64 MB page cache and up to 256 MB memory-mapped reads keep the hot tables in memory.
 *  - temporary sort and GROUP BY tables live in memory.
 *  - `PRAGMA optimize` at open, periodically and at close keeps the planner statistics current
 *    without a full ANALYZE.
 */
export function openDatabase(path: string): DatabaseHandle {
  const inMemory = path === ':memory:';
  if (!inMemory) {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA temp_store = MEMORY;');
  sqlite.exec('PRAGMA cache_size = -64000;');
  if (!inMemory) {
    sqlite.exec('PRAGMA journal_mode = WAL;');
    sqlite.exec('PRAGMA synchronous = NORMAL;');
    sqlite.exec('PRAGMA busy_timeout = 5000;');
    sqlite.exec('PRAGMA mmap_size = 268435456;');
  }
  const db = createDrizzle(sqlite);
  migrate(db, { migrationsFolder });
  // 0x10002: also analyze tables that never had statistics (new or migrated databases).
  sqlite.exec('PRAGMA optimize = 0x10002;');
  const optimize = () => sqlite.exec('PRAGMA optimize;');
  return {
    db,
    sqlite,
    optimize,
    close: () => {
      optimize();
      sqlite.close();
    },
  };
}
