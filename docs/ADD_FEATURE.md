# Adding a new entity

1. **Schema** — append `CREATE TABLE IF NOT EXISTS` to `backend/internal/db/schema.sql`.
   Every domain table has `user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`
   and an index on `(user_id)`.

2. **Queries** — create `backend/internal/<feature>/queries.sql` with:
   - `Get<X>` (filters by `id` AND `user_id`)
   - `List<X>` (filters by `user_id`, ordered + paginated)
   - `Count<X>` (for paginated responses)
   - `Create<X>`, `Update<X>` (set `user_id` from session), `Delete<X>`

3. **Regenerate** — `make sqlc`.

4. **Handler** — `backend/internal/<feature>/handler.go`:
   - request structs with `validate` tags
   - `NewHandler(q sqlc.Querier, db *sql.DB) *Handler`
   - methods: `List`, `Create`, `Get`, `Update`, `Delete`
   - read `userID` from middleware: `appmw.GetUserID(r)`

5. **Route** — wire it in `internal/router/router.go` under the authenticated group.

6. **Tests** — minimum: happy-path + cross-user isolation in `tests/integration/`.

7. **Frontend types** — mirror the response in `frontend/src/lib/types.ts`.

8. **API hook** — add `frontend/src/lib/api/<feature>.ts` using TanStack Query.

9. **Page** — `frontend/src/routes/<X>.svelte`. Add to `src/lib/routes.ts`.

10. **Zod schema** (optional) — `frontend/src/lib/schemas/<feature>.ts` to mirror server rules.
