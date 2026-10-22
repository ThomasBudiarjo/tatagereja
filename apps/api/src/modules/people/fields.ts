import {
  can,
  churchIdParamsSchema,
  churchParamsSchema,
  customFieldDefinitionInputSchema,
  has,
  PEOPLE_LIMITS,
  personTagInputSchema,
  type PersonTag,
} from '@tatagereja/shared';
import { and, asc, count, eq, inArray, ne, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { CustomFieldDefinitionRow, PersonTagRow } from '../../db/schema';
import {
  customFieldDefinitions,
  customFieldValues,
  personTagAssignments,
  personTags,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit } from '../../services/audit';
import { fieldDefinitionsOf, toCustomFieldDefinition } from '../../services/people-fields';

/** Church-defined tags (label) and custom fields (kolom tambahan) on person records. */
export const directoryFieldsRouter = (deps: Deps) => {
  const { db } = deps;

  const hydrateTags = (rows: PersonTagRow[]): PersonTag[] => {
    if (rows.length === 0) return [];
    const counts = new Map(
      db
        .select({ tagId: personTagAssignments.tagId, value: count() })
        .from(personTagAssignments)
        .where(
          inArray(
            personTagAssignments.tagId,
            rows.map((row) => row.id),
          ),
        )
        .groupBy(personTagAssignments.tagId)
        .all()
        .map((row) => [row.tagId, row.value]),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      personCount: counts.get(row.id) ?? 0,
    }));
  };

  const loadTag = (churchId: string, id: string): PersonTagRow => {
    const row = db
      .select()
      .from(personTags)
      .where(and(eq(personTags.id, id), eq(personTags.churchId, churchId)))
      .get();
    if (!row) throw notFound('Tag');
    return row;
  };

  const loadField = (churchId: string, id: string): CustomFieldDefinitionRow => {
    const row = db
      .select()
      .from(customFieldDefinitions)
      .where(and(eq(customFieldDefinitions.id, id), eq(customFieldDefinitions.churchId, churchId)))
      .get();
    if (!row) throw notFound('Custom field');
    return row;
  };

  const assertTagName = (churchId: string, name: string, exceptId?: string) => {
    const conditions: SQL[] = [eq(personTags.churchId, churchId), eq(personTags.name, name)];
    if (exceptId) conditions.push(ne(personTags.id, exceptId));
    if (
      db
        .select({ id: personTags.id })
        .from(personTags)
        .where(and(...conditions))
        .get()
    ) {
      throw conflict('A tag with this name already exists');
    }
  };

  const assertFieldKey = (churchId: string, key: string, exceptId?: string) => {
    const conditions: SQL[] = [
      eq(customFieldDefinitions.churchId, churchId),
      eq(customFieldDefinitions.key, key),
    ];
    if (exceptId) conditions.push(ne(customFieldDefinitions.id, exceptId));
    if (
      db
        .select({ id: customFieldDefinitions.id })
        .from(customFieldDefinitions)
        .where(and(...conditions))
        .get()
    ) {
      throw conflict('A field with this key already exists');
    }
  };

  const requireManage = (access: Parameters<typeof can.manageCustomFields>[0]) => {
    if (!can.manageCustomFields(access)) throw forbidden('You cannot manage tags and fields');
  };

  return new Elysia({ prefix: '/churches/:churchId/directory' })
    .use(authPlugin(deps))
    .get(
      '/tags',
      ({ church }) => ({
        items: hydrateTags(
          db
            .select()
            .from(personTags)
            .where(eq(personTags.churchId, church.id))
            .orderBy(asc(personTags.name))
            .all(),
        ),
      }),
      { church: { module: 'people', permission: 'people.view' }, params: churchParamsSchema },
    )
    .post(
      '/tags',
      ({ church, access, body, set }) => {
        requireManage(access);
        const total =
          db
            .select({ value: count() })
            .from(personTags)
            .where(eq(personTags.churchId, church.id))
            .get()?.value ?? 0;
        if (total >= PEOPLE_LIMITS.tagsMax) throw conflict('This church has too many tags');
        assertTagName(church.id, body.name);
        const row = db
          .insert(personTags)
          .values({ id: newId(), churchId: church.id, ...body, createdAt: nowIso() })
          .returning()
          .get();
        set.status = 201;
        return { tag: hydrateTags([row])[0] };
      },
      { church: 'people', params: churchParamsSchema, body: personTagInputSchema },
    )
    .patch(
      '/tags/:id',
      ({ church, access, params, body }) => {
        requireManage(access);
        const tag = loadTag(church.id, params.id);
        assertTagName(church.id, body.name, tag.id);
        const row = db
          .update(personTags)
          .set(body)
          .where(eq(personTags.id, tag.id))
          .returning()
          .get();
        if (!row) throw notFound('Tag');
        return { tag: hydrateTags([row])[0] };
      },
      { church: 'people', params: churchIdParamsSchema, body: personTagInputSchema },
    )
    .delete(
      '/tags/:id',
      ({ church, access, audit, params }) => {
        requireManage(access);
        const tag = loadTag(church.id, params.id);
        db.transaction((tx) => {
          recordAudit(tx, audit, {
            module: 'people',
            action: 'tag.delete',
            entityType: 'tag',
            entityId: tag.id,
            summary: `Deleted the tag ${tag.name}`,
            before: { name: tag.name },
          });
          tx.delete(personTags).where(eq(personTags.id, tag.id)).run();
        });
        return { ok: true as const };
      },
      { church: 'people', params: churchIdParamsSchema },
    )
    .get(
      '/fields',
      ({ church, access }) => {
        const manage = can.manageCustomFields(access);
        const seesPrivate =
          has(access, 'people.private.view') || has(access, 'people.private.edit');
        return {
          items: fieldDefinitionsOf(db, church.id)
            .filter((field) => manage || (field.isActive && (!field.isPrivate || seesPrivate)))
            .map(toCustomFieldDefinition),
        };
      },
      { church: { module: 'people', permission: 'people.view' }, params: churchParamsSchema },
    )
    .post(
      '/fields',
      ({ church, access, audit, body, set }) => {
        requireManage(access);
        const total =
          db
            .select({ value: count() })
            .from(customFieldDefinitions)
            .where(eq(customFieldDefinitions.churchId, church.id))
            .get()?.value ?? 0;
        if (total >= PEOPLE_LIMITS.customFieldsMax) {
          throw conflict('This church has too many custom fields');
        }
        assertFieldKey(church.id, body.key);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const field = tx
            .insert(customFieldDefinitions)
            .values({
              id: newId(),
              churchId: church.id,
              ...body,
              options: body.type === 'select' ? body.options : [],
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'people',
            action: 'custom_field.create',
            entityType: 'custom_field',
            entityId: field.id,
            summary: `Added the custom field ${field.label}`,
            after: { key: field.key, type: field.type, isPrivate: field.isPrivate },
          });
          return field;
        });
        set.status = 201;
        return { field: toCustomFieldDefinition(row) };
      },
      { church: 'people', params: churchParamsSchema, body: customFieldDefinitionInputSchema },
    )
    .patch(
      '/fields/:id',
      ({ church, access, params, body }) => {
        requireManage(access);
        const field = loadField(church.id, params.id);
        assertFieldKey(church.id, body.key, field.id);
        if (body.type !== field.type) {
          const used = db
            .select({ value: count() })
            .from(customFieldValues)
            .where(eq(customFieldValues.fieldId, field.id))
            .get()?.value;
          if (used) {
            throw conflict(
              'This field already has values. Create a new field to use another type.',
            );
          }
        }
        const row = db
          .update(customFieldDefinitions)
          .set({
            ...body,
            options: body.type === 'select' ? body.options : [],
            updatedAt: nowIso(),
          })
          .where(eq(customFieldDefinitions.id, field.id))
          .returning()
          .get();
        if (!row) throw notFound('Custom field');
        return { field: toCustomFieldDefinition(row) };
      },
      {
        church: 'people',
        params: churchIdParamsSchema,
        body: customFieldDefinitionInputSchema,
      },
    )
    .delete(
      '/fields/:id',
      ({ church, access, audit, params }) => {
        requireManage(access);
        const field = loadField(church.id, params.id);
        db.transaction((tx) => {
          const values =
            tx
              .select({ value: count() })
              .from(customFieldValues)
              .where(eq(customFieldValues.fieldId, field.id))
              .get()?.value ?? 0;
          recordAudit(tx, audit, {
            module: 'people',
            action: 'custom_field.delete',
            entityType: 'custom_field',
            entityId: field.id,
            summary: `Deleted the custom field ${field.label} and its ${values} values`,
            before: { key: field.key, label: field.label, values },
          });
          tx.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, field.id)).run();
        });
        return { ok: true as const };
      },
      { church: 'people', params: churchIdParamsSchema },
    );
};
