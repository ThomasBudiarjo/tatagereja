import {
  canEditPrivateField,
  canViewPrivateField,
  isValidCustomFieldValue,
  type AccessLike,
  type CustomFieldDefinition,
  type CustomFieldValue,
  type ValidationIssue,
} from '@tatagereja/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Queryable } from '../db/client';
import type { CustomFieldDefinitionRow, PersonRow } from '../db/schema';
import {
  customFieldDefinitions,
  customFieldValues,
  people,
  personTagAssignments,
  personTags,
} from '../db/schema';
import { notFound, validationError } from '../lib/errors';
import { nowIso } from '../lib/time';
import { personIdsIn } from './people';

export const toCustomFieldDefinition = (row: CustomFieldDefinitionRow): CustomFieldDefinition => ({
  id: row.id,
  key: row.key,
  label: row.label,
  type: row.type,
  options: Array.isArray(row.options) ? row.options.map(String) : [],
  helpText: row.helpText,
  isRequired: row.isRequired,
  isPrivate: row.isPrivate,
  isActive: row.isActive,
  sortOrder: row.sortOrder,
});

export function loadPersonRow(db: Queryable, churchId: string, id: string): PersonRow {
  const person = db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.churchId, churchId)))
    .get();
  if (!person) throw notFound('Person');
  return person;
}

export function fieldDefinitionsOf(db: Queryable, churchId: string): CustomFieldDefinitionRow[] {
  return db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.churchId, churchId))
    .orderBy(asc(customFieldDefinitions.sortOrder), asc(customFieldDefinitions.label))
    .all();
}

/** A person's custom field values the caller may see, in field order (active fields only). */
export function customFieldsOf(
  db: Queryable,
  access: AccessLike,
  person: Pick<PersonRow, 'id' | 'userId' | 'churchId'>,
): CustomFieldValue[] {
  const seesPrivate = canViewPrivateField(access, person);
  const values = new Map(
    db
      .select({ fieldId: customFieldValues.fieldId, value: customFieldValues.value })
      .from(customFieldValues)
      .where(eq(customFieldValues.personId, person.id))
      .all()
      .map((row) => [row.fieldId, row.value]),
  );
  return fieldDefinitionsOf(db, person.churchId)
    .filter((field) => field.isActive && (!field.isPrivate || seesPrivate))
    .map((field) => ({
      field: toCustomFieldDefinition(field),
      value: values.get(field.id) ?? null,
    }));
}

/** Stored custom field values of several people, by person and field (no visibility rules). */
export function customFieldValuesByPerson(
  db: Queryable,
  personIds: readonly string[],
  churchId?: string,
): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  if (personIds.length === 0) return result;
  for (const row of db
    .select()
    .from(customFieldValues)
    .where(personIdsIn(db, customFieldValues.personId, personIds, churchId))
    .all()) {
    const values = result.get(row.personId) ?? new Map<string, string>();
    values.set(row.fieldId, row.value);
    result.set(row.personId, values);
  }
  return result;
}

/**
 * Saves custom field values (null or an empty string clears one). Every field must belong to
 * the church and be active, private fields need the private-details rules, and values must
 * match their type. With `requireComplete`, required fields must end up with a value.
 * Issues are reported under `customFields.<fieldId>`.
 */
export function saveCustomFieldValues(
  db: Queryable,
  access: AccessLike,
  person: Pick<PersonRow, 'id' | 'userId' | 'churchId'>,
  values: Record<string, string | null>,
  { requireComplete = false, pathPrefix = 'customFields' } = {},
): void {
  const definitions = new Map(
    fieldDefinitionsOf(db, person.churchId).map((field) => [field.id, field]),
  );
  const issues: ValidationIssue[] = [];
  const now = nowIso();
  const writes: { fieldId: string; value: string | null }[] = [];
  for (const [fieldId, raw] of Object.entries(values)) {
    const field = definitions.get(fieldId);
    if (!field || !field.isActive) {
      issues.push({ path: `${pathPrefix}.${fieldId}`, message: 'Unknown field' });
      continue;
    }
    if (field.isPrivate && !canEditPrivateField(access, person)) {
      issues.push({ path: `${pathPrefix}.${fieldId}`, message: 'You cannot change this field' });
      continue;
    }
    const value = raw === null ? null : raw.trim();
    if (value && !isValidCustomFieldValue(toCustomFieldDefinition(field), value)) {
      issues.push({
        path: `${pathPrefix}.${fieldId}`,
        message: `Invalid value for ${field.label}`,
      });
      continue;
    }
    if (!value && field.isRequired) {
      issues.push({ path: `${pathPrefix}.${fieldId}`, message: `${field.label} is required` });
      continue;
    }
    writes.push({ fieldId, value: value || null });
  }
  if (requireComplete) {
    const existing = new Set(
      db
        .select({ fieldId: customFieldValues.fieldId })
        .from(customFieldValues)
        .where(eq(customFieldValues.personId, person.id))
        .all()
        .map((row) => row.fieldId),
    );
    for (const field of definitions.values()) {
      if (!field.isActive || !field.isRequired || fieldIdIn(values, field.id)) continue;
      if (field.isPrivate && !canEditPrivateField(access, person)) continue;
      if (!existing.has(field.id)) {
        issues.push({ path: `${pathPrefix}.${field.id}`, message: `${field.label} is required` });
      }
    }
  }
  if (issues.length > 0) throw validationError('Check the custom fields', issues);
  for (const write of writes) {
    if (write.value === null) {
      db.delete(customFieldValues)
        .where(
          and(
            eq(customFieldValues.personId, person.id),
            eq(customFieldValues.fieldId, write.fieldId),
          ),
        )
        .run();
    } else {
      db.insert(customFieldValues)
        .values({
          personId: person.id,
          fieldId: write.fieldId,
          churchId: person.churchId,
          value: write.value,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [customFieldValues.personId, customFieldValues.fieldId],
          set: { value: write.value, updatedAt: now },
        })
        .run();
    }
  }
}

const fieldIdIn = (values: Record<string, unknown>, id: string) =>
  Object.prototype.hasOwnProperty.call(values, id);

/** Replaces a person's tags; every tag must belong to the church. */
export function savePersonTags(
  db: Queryable,
  churchId: string,
  personId: string,
  tagIds: readonly string[],
): void {
  const unique = [...new Set(tagIds)];
  if (unique.length > 0) {
    const found = db
      .select({ id: personTags.id })
      .from(personTags)
      .where(and(eq(personTags.churchId, churchId), inArray(personTags.id, unique)))
      .all();
    if (found.length !== unique.length) throw notFound('One or more tags');
  }
  db.delete(personTagAssignments).where(eq(personTagAssignments.personId, personId)).run();
  if (unique.length === 0) return;
  const now = nowIso();
  db.insert(personTagAssignments)
    .values(unique.map((tagId) => ({ personId, tagId, churchId, assignedAt: now })))
    .run();
}
