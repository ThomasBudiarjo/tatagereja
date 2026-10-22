import { Elysia } from 'elysia';
import type { Deps } from '../../deps';

/**
 * People extensions: households, areas, tags and custom fields, import/export, merge. The existing
 * directory and groups routers live in ../people.ts and ../groups.ts.
 *
 * Owned by the people module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. See docs/ARCHITECTURE-MODULES.md.
 */
export const peopleExtensionsModule = (_deps: Deps) => new Elysia();
