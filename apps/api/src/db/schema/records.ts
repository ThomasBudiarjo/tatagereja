// Tables owned by the records module. Every church-owned table carries `church_id` with
// `onDelete: 'cascade'`; see docs/ARCHITECTURE-MODULES.md. Export row types next to the tables.
// Registry entries are corrected or voided, never hard-deleted; every change is audited.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { churches, people, users } from './core';

/**
 * One entry in the church register (buku induk): baptis, sidi, pemberkatan nikah, penyerahan
 * anak, atestasi masuk/keluar, kedukaan or a custom milestone. `number` is generated from the
 * church's pattern (e.g. "B/2026/001") using `sequence`, which counts per type and year.
 */
export const registryRecords = sqliteTable(
  'registry_records',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    type: text('type', {
      enum: [
        'baptism',
        'sidi',
        'marriage',
        'child_dedication',
        'transfer_in',
        'transfer_out',
        'death',
        'custom',
      ],
    }).notNull(),
    /** `infant`/`adult` for baptism; the milestone name for `custom`. */
    subtype: text('subtype'),
    year: integer('year').notNull(),
    sequence: integer('sequence').notNull(),
    number: text('number').notNull(),
    /** Date of the event itself, YYYY-MM-DD. */
    date: text('date').notNull(),
    place: text('place'),
    officiantPersonId: text('officiant_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    officiantName: text('officiant_name'),
    /**
     * Type-specific details validated by the shared schema: origin/destination church for
     * atestasi, parents for baptism and dedication, cause and burial place for death, ...
     */
    details: text('details', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    documentUrl: text('document_url'),
    notes: text('notes'),
    status: text('status', { enum: ['active', 'voided'] })
      .notNull()
      .default('active'),
    voidedAt: text('voided_at'),
    voidedBy: text('voided_by').references(() => users.id, { onDelete: 'set null' }),
    voidReason: text('void_reason'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('registry_records_church_type_year_sequence_unique').on(
      table.churchId,
      table.type,
      table.year,
      table.sequence,
    ),
    uniqueIndex('registry_records_church_number_unique').on(table.churchId, table.number),
    index('registry_records_church_type_date_idx').on(table.churchId, table.type, table.date),
  ],
);

/**
 * The people named on a record. `person_id` links church members; `name` is a snapshot kept for
 * the certificate (and is the only value for outsiders such as a witness from another church).
 */
export const registryRecordPeople = sqliteTable(
  'registry_record_people',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    recordId: text('record_id')
      .notNull()
      .references(() => registryRecords.id, { onDelete: 'cascade' }),
    personId: text('person_id').references(() => people.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    role: text('role', {
      enum: ['subject', 'spouse', 'father', 'mother', 'godparent', 'witness', 'other'],
    }).notNull(),
    position: integer('position').notNull().default(0),
  },
  (table) => [
    index('registry_record_people_record_idx').on(table.recordId, table.position),
    index('registry_record_people_person_idx').on(table.personId),
  ],
);

export type RegistryRecordRow = typeof registryRecords.$inferSelect;
export type RegistryRecordPersonRow = typeof registryRecordPeople.$inferSelect;
