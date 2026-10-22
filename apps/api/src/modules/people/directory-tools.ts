import {
  PERSON_CSV_COLUMNS,
  can,
  churchParamsSchema,
  directoryExportQuerySchema,
  fullName,
  has,
  mergePeopleBodySchema,
  normalizeImportRow,
  normalizeName,
  isValidCustomFieldValue,
  normalizePhone,
  personImportBodySchema,
  personImportRowSchema,
  type DuplicateCandidate,
  type PersonImportResult,
  type PersonImportRow,
} from '@tatagereja/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { PersonRow } from '../../db/schema';
import {
  areas,
  customFieldDefinitions,
  customFieldValues,
  householdMembers,
  households,
  people,
  personAreas,
  personTags,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit } from '../../services/audit';
import {
  directoryConditions,
  hydrateDirectory,
  hydrateDirectoryOne,
  sendCsv,
  toCsv,
  todayIn,
} from '../../services/people';
import {
  customFieldsOf,
  loadPersonRow,
  savePersonTags,
  toCustomFieldDefinition,
} from '../../services/people-fields';
import { toPersonSummary } from '../../serializers';

const DUPLICATES_MAX = 100;

type Signature = { name: string; email: string | null; phone: string | null; birth: string | null };

const signatureOf = (person: {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
}): Signature => ({
  name: normalizeName(person),
  email: person.email ? person.email.trim().toLowerCase() : null,
  phone: normalizePhone(person.phone),
  birth: person.birthDate,
});

/**
 * Why two records look like the same person. Same name alone is enough to ask; a phone number
 * alone is not, because families often share one.
 */
const matchReasons = (a: Signature, b: Signature): DuplicateCandidate['reasons'] => {
  const reasons: DuplicateCandidate['reasons'] = [];
  if (a.name && a.name === b.name) reasons.push('name');
  if (a.email && a.email === b.email) reasons.push('email');
  if (a.phone && a.phone === b.phone) reasons.push('phone');
  if (a.birth && a.birth === b.birth && reasons.length > 0) reasons.push('birthDate');
  return reasons.length === 1 && reasons[0] === 'phone' ? [] : reasons;
};

const SCORE: Record<DuplicateCandidate['reasons'][number], number> = {
  name: 0.45,
  email: 0.35,
  phone: 0.3,
  birthDate: 0.25,
};

/**
 * Every table column that references `people.id`, read from the database itself so records
 * added by any module (attendance, registry, care, giving, check-in, ...) move on a merge.
 */
let personReferences: { table: string; column: string }[] | null = null;
function personReferenceColumns(db: Queryable): { table: string; column: string }[] {
  if (personReferences) return personReferences;
  const tables = db.all<{ name: string }>(
    sql`select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'`,
  );
  const found: { table: string; column: string }[] = [];
  for (const { name } of tables) {
    const keys = db.all<{ table: string; from: string; to: string }>(
      sql.raw(`pragma foreign_key_list("${name.replace(/"/g, '""')}")`),
    );
    for (const key of keys) {
      if (key.table === 'people' && key.to === 'id' && name !== 'people') {
        found.push({ table: name, column: key.from });
      }
    }
  }
  personReferences = found;
  return found;
}

/** Directory export, CSV import, the duplicate finder and merging two records. */
export const directoryToolsRouter = (deps: Deps) => {
  const { db } = deps;

  return new Elysia({ prefix: '/churches/:churchId/people' })
    .use(authPlugin(deps))
    .get(
      '/export',
      ({ church, access, audit, query, set }) => {
        const today = todayIn(church);
        const rows = db
          .select()
          .from(people)
          .where(and(...directoryConditions(db, access, church.id, query, today)))
          .orderBy(asc(sql`${people.firstName} collate nocase`), asc(people.lastName))
          .all();
        const directory = hydrateDirectory(db, access, rows);
        const areaNames = new Map(
          db
            .select({ id: areas.id, name: areas.name })
            .from(areas)
            .where(eq(areas.churchId, church.id))
            .all()
            .map((row) => [row.id, row.name]),
        );
        const tagNames = new Map(
          db
            .select({ id: personTags.id, name: personTags.name })
            .from(personTags)
            .where(eq(personTags.churchId, church.id))
            .all()
            .map((row) => [row.id, row.name]),
        );
        const fields = db
          .select()
          .from(customFieldDefinitions)
          .where(eq(customFieldDefinitions.churchId, church.id))
          .orderBy(asc(customFieldDefinitions.sortOrder))
          .all()
          .filter((field) => field.isActive);
        const header = [...PERSON_CSV_COLUMNS, ...fields.map((field) => `field:${field.key}`)];
        const lines = directory.map((person, index) => {
          const row = rows[index] as PersonRow;
          const values = new Map(
            customFieldsOf(db, access, row).map((item) => [item.field.id, item.value]),
          );
          return [
            person.firstName,
            person.lastName,
            person.gender,
            person.birthDate,
            person.email,
            person.phone,
            person.address,
            person.membershipStatus,
            person.joinedAt,
            person.weddingDate,
            person.householdName,
            person.relationship,
            person.areaId ? (areaNames.get(person.areaId) ?? null) : null,
            person.tagIds
              .map((id) => tagNames.get(id) ?? '')
              .filter(Boolean)
              .join('; '),
            person.notes,
            // Private fields the caller may not see are missing from `values` and stay empty.
            ...fields.map((field) => values.get(field.id) ?? null),
          ];
        });
        db.transaction((tx) =>
          recordAudit(tx, audit, {
            module: 'people',
            action: 'person.export',
            entityType: 'person',
            summary: `Exported ${directory.length} people as CSV`,
            after: { count: directory.length, filters: query },
          }),
        );
        return sendCsv(set, `jemaat-${today}.csv`, toCsv([header, ...lines]));
      },
      {
        church: { module: 'people', permission: 'people.export' },
        params: churchParamsSchema,
        query: directoryExportQuerySchema,
      },
    )
    .post(
      '/import',
      ({ church, access, audit, body }) => {
        if (!can.createPerson(access)) throw forbidden('You cannot add people');
        const canHouseholds = can.manageHouseholds(access);
        const canTags = has(access, 'people.fields.manage');
        const existing = db
          .select({
            id: people.id,
            firstName: people.firstName,
            lastName: people.lastName,
            email: people.email,
            phone: people.phone,
            birthDate: people.birthDate,
          })
          .from(people)
          .where(eq(people.churchId, church.id))
          .all()
          .map((row) => ({ id: row.id, signature: signatureOf(row) }));
        const areaByName = new Map<string, string>();
        for (const area of db.select().from(areas).where(eq(areas.churchId, church.id)).all()) {
          areaByName.set(area.name.toLowerCase(), area.id);
          if (area.code) areaByName.set(area.code.toLowerCase(), area.id);
        }
        const tagByName = new Map(
          db
            .select({ id: personTags.id, name: personTags.name })
            .from(personTags)
            .where(eq(personTags.churchId, church.id))
            .all()
            .map((row) => [row.name.toLowerCase(), row.id]),
        );
        const fieldByKey = new Map(
          db
            .select()
            .from(customFieldDefinitions)
            .where(eq(customFieldDefinitions.churchId, church.id))
            .all()
            .filter((field) => field.isActive)
            .map((field) => [field.key, field]),
        );
        const allowed = new Set(body.allowDuplicateRows);

        type Parsed = {
          index: number;
          row: PersonImportRow;
          issues: PersonImportResult['rows'][number]['issues'];
        };
        const results: PersonImportResult['rows'] = [];
        const accepted: Parsed[] = [];
        const seen: { index: number; signature: Signature }[] = [];
        body.rows.forEach((raw, index) => {
          const normalized = normalizeImportRow(raw);
          const parsed = personImportRowSchema.safeParse(normalized);
          if (!parsed.success) {
            results.push({
              index,
              status: 'invalid',
              issues: parsed.error.issues.map((issue) => ({
                path: issue.path.map(String).join('.') || 'root',
                code:
                  issue.code === 'invalid_type' &&
                  (normalized as Record<string, unknown>)[String(issue.path[0])] === undefined
                    ? ('missing' as const)
                    : ('invalid' as const),
                message: issue.message,
              })),
              duplicateOf: [],
            });
            return;
          }
          const row = parsed.data;
          const issues: Parsed['issues'] = [];
          let invalid = false;
          if (row.areaName && !areaByName.has(row.areaName.toLowerCase())) {
            issues.push({
              path: 'areaName',
              code: 'unknown_area',
              message: `Unknown area "${row.areaName}"`,
            });
            invalid = true;
          }
          if (row.householdName && !canHouseholds) {
            issues.push({
              path: 'householdName',
              code: 'household_ignored',
              message: 'Household ignored: no permission',
            });
          }
          for (const tag of row.tags) {
            if (!tagByName.has(tag.toLowerCase()) && !canTags) {
              issues.push({
                path: 'tags',
                code: 'unknown_tag',
                message: `Unknown tag "${tag}" ignored`,
              });
            }
          }
          for (const [key, value] of Object.entries(row.customFields)) {
            const field = fieldByKey.get(key);
            if (!field) {
              issues.push({
                path: `customFields.${key}`,
                code: 'unknown_field',
                message: `Unknown field "${key}" ignored`,
              });
            } else if (!isValidCustomFieldValue(toCustomFieldDefinition(field), value)) {
              issues.push({
                path: `customFields.${key}`,
                code: 'invalid_field_value',
                message: `Invalid value for ${field.label}`,
              });
              invalid = true;
            }
          }
          if (invalid) {
            results.push({ index, status: 'invalid', issues, duplicateOf: [] });
            return;
          }
          const signature = signatureOf({
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone,
            birthDate: row.birthDate,
          });
          const duplicateOf = existing
            .filter((person) => matchReasons(signature, person.signature).length > 0)
            .map((person) => person.id);
          const inFile = seen.some((other) => matchReasons(signature, other.signature).length > 0);
          seen.push({ index, signature });
          if ((duplicateOf.length > 0 || inFile) && !allowed.has(index)) {
            if (inFile)
              issues.push({
                path: 'root',
                code: 'duplicate_in_file',
                message: 'Same person appears earlier in the file',
              });
            results.push({
              index,
              status: body.dryRun ? 'duplicate' : 'skipped',
              issues,
              duplicateOf,
            });
            return;
          }
          results.push({ index, status: 'ok', issues, duplicateOf });
          accepted.push({ index, row, issues });
        });

        if (body.dryRun) return { dryRun: true, created: 0, rows: results };

        const now = nowIso();
        const householdByName = new Map(
          db
            .select({ id: households.id, name: households.name })
            .from(households)
            .where(eq(households.churchId, church.id))
            .all()
            .map((row) => [row.name.toLowerCase(), row.id]),
        );
        db.transaction((tx) => {
          for (const { index, row } of accepted) {
            const { householdName, relationship, areaName, tags, customFields, ...profile } = row;
            const person = tx
              .insert(people)
              .values({
                id: newId(),
                churchId: church.id,
                ...profile,
                userId: null,
                createdAt: now,
                updatedAt: now,
              })
              .returning()
              .get();
            if (householdName && canHouseholds) {
              let householdId = householdByName.get(householdName.toLowerCase());
              if (!householdId) {
                householdId = newId();
                tx.insert(households)
                  .values({
                    id: householdId,
                    churchId: church.id,
                    name: householdName,
                    areaId: areaName ? (areaByName.get(areaName.toLowerCase()) ?? null) : null,
                    address: profile.address,
                    phone: profile.phone,
                    createdAt: now,
                    updatedAt: now,
                  })
                  .run();
                householdByName.set(householdName.toLowerCase(), householdId);
              }
              tx.insert(householdMembers)
                .values({
                  id: newId(),
                  churchId: church.id,
                  householdId,
                  personId: person.id,
                  relationship: relationship ?? 'other',
                  isPrimaryContact: relationship === 'head',
                  addedAt: now,
                })
                .run();
            }
            if (areaName) {
              const areaId = areaByName.get(areaName.toLowerCase());
              const household = householdName
                ? householdByName.get(householdName.toLowerCase())
                : undefined;
              const householdArea = household
                ? tx
                    .select({ areaId: households.areaId })
                    .from(households)
                    .where(eq(households.id, household))
                    .get()?.areaId
                : undefined;
              if (areaId && householdArea !== areaId) {
                tx.insert(personAreas)
                  .values({ personId: person.id, churchId: church.id, areaId, assignedAt: now })
                  .run();
              }
            }
            const tagIds: string[] = [];
            for (const tag of tags) {
              let tagId = tagByName.get(tag.toLowerCase());
              if (!tagId && canTags) {
                tagId = newId();
                tx.insert(personTags)
                  .values({ id: tagId, churchId: church.id, name: tag, createdAt: now })
                  .run();
                tagByName.set(tag.toLowerCase(), tagId);
              }
              if (tagId && !tagIds.includes(tagId)) tagIds.push(tagId);
            }
            if (tagIds.length > 0) savePersonTags(tx, church.id, person.id, tagIds);
            for (const [key, value] of Object.entries(customFields)) {
              const field = fieldByKey.get(key);
              if (!field) continue;
              tx.insert(customFieldValues)
                .values({
                  personId: person.id,
                  fieldId: field.id,
                  churchId: church.id,
                  value,
                  updatedAt: now,
                })
                .run();
            }
            const result = results.find((item) => item.index === index);
            if (result) result.status = 'created';
          }
          recordAudit(tx, audit, {
            module: 'people',
            action: 'person.import',
            entityType: 'person',
            summary: `Imported ${accepted.length} people from CSV`,
            after: { created: accepted.length, rows: body.rows.length },
          });
        });
        return { dryRun: false, created: accepted.length, rows: results };
      },
      { church: 'people', params: churchParamsSchema, body: personImportBodySchema },
    )
    .get(
      '/duplicates',
      ({ church }) => {
        const rows = db
          .select()
          .from(people)
          .where(eq(people.churchId, church.id))
          .orderBy(asc(people.createdAt))
          .all();
        const signatures = rows.map((row) => ({ row, signature: signatureOf(row) }));
        // Bucket by each key so the comparison stays close to linear for large directories.
        const buckets = new Map<string, number[]>();
        signatures.forEach(({ signature }, index) => {
          for (const key of [
            signature.name && `n:${signature.name}`,
            signature.email && `e:${signature.email}`,
            signature.phone && `p:${signature.phone}`,
          ]) {
            if (!key) continue;
            const list = buckets.get(key) ?? [];
            list.push(index);
            buckets.set(key, list);
          }
        });
        const pairs = new Map<string, DuplicateCandidate>();
        for (const indexes of buckets.values()) {
          for (let i = 0; i < indexes.length; i += 1) {
            for (let j = i + 1; j < indexes.length; j += 1) {
              const a = signatures[indexes[i] as number];
              const b = signatures[indexes[j] as number];
              if (!a || !b) continue;
              const key = `${a.row.id}:${b.row.id}`;
              if (pairs.has(key)) continue;
              const reasons = matchReasons(a.signature, b.signature);
              if (reasons.length === 0) continue;
              pairs.set(key, {
                people: [toPersonSummary(a.row), toPersonSummary(b.row)],
                reasons,
                score: Math.min(
                  1,
                  reasons.reduce((sum, reason) => sum + SCORE[reason], 0),
                ),
              });
            }
          }
        }
        const items = [...pairs.values()]
          .sort((a, b) => b.score - a.score)
          .slice(0, DUPLICATES_MAX);
        return { items };
      },
      {
        church: { module: 'people', permission: 'people.merge' },
        params: churchParamsSchema,
      },
    )
    .post(
      '/merge',
      ({ church, access, audit, body }) => {
        const keep = loadPersonRow(db, church.id, body.keepId);
        const merge = loadPersonRow(db, church.id, body.mergeId);
        if (keep.userId && merge.userId) {
          throw conflict('Both records are linked to member accounts. Unlink one first.');
        }
        const moved: Record<string, number> = {};
        const updated = db.transaction((tx) => {
          const patch: Partial<PersonRow> = {};
          for (const field of body.takeFields) {
            (patch as Record<string, unknown>)[field] = merge[field];
          }
          // Fill empty fields of the kept record from the merged one.
          for (const field of [
            'lastName',
            'birthDate',
            'email',
            'phone',
            'address',
            'photoUrl',
            'joinedAt',
            'weddingDate',
            'notes',
          ] as const) {
            if (keep[field] === null && merge[field] !== null && !(field in patch)) {
              (patch as Record<string, unknown>)[field] = merge[field];
            }
          }
          if (merge.userId && !keep.userId) {
            tx.update(people).set({ userId: null }).where(eq(people.id, merge.id)).run();
            patch.userId = merge.userId;
          }
          for (const { table, column } of personReferenceColumns(tx)) {
            const where = sql`${sql.identifier(column)} = ${merge.id}`;
            const countRows = () =>
              tx.all<{ value: number }>(
                sql`select count(*) as value from ${sql.identifier(table)} where ${where}`,
              )[0]?.value ?? 0;
            const total = countRows();
            if (total === 0) continue;
            // Rows that would duplicate one the kept record already has stay behind and are
            // removed with the merged record (or keep a null reference).
            tx.run(
              sql`update or ignore ${sql.identifier(table)} set ${sql.identifier(column)} = ${keep.id} where ${where}`,
            );
            const left = countRows();
            if (total - left > 0) moved[table] = (moved[table] ?? 0) + total - left;
          }
          tx.delete(people).where(eq(people.id, merge.id)).run();
          const row = tx
            .update(people)
            .set({ ...patch, updatedAt: nowIso() })
            .where(eq(people.id, keep.id))
            .returning()
            .get();
          if (!row) throw notFound('Person');
          recordAudit(tx, audit, {
            module: 'people',
            action: 'person.merge',
            entityType: 'person',
            entityId: keep.id,
            summary: `Merged ${fullName(merge)} into ${fullName(keep)}`,
            before: {
              keep: { id: keep.id, name: fullName(keep) },
              merged: { id: merge.id, name: fullName(merge), userId: merge.userId },
            },
            after: { takeFields: body.takeFields, moved },
          });
          return row;
        });
        return { person: hydrateDirectoryOne(db, access, updated), moved };
      },
      {
        church: { module: 'people', permission: 'people.merge' },
        params: churchParamsSchema,
        body: mergePeopleBodySchema,
      },
    );
};
