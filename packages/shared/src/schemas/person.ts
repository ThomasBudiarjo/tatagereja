import { z } from 'zod';
import { GENDERS, LIMITS, MARITAL_STATUSES, PERSON_MEMBERSHIP_STATUSES } from '../constants';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  optionalDate,
  optionalEmail,
  optionalText,
  optionalUrl,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
} from './common';

export const personSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  firstName: z.string(),
  lastName: z.string().nullable(),
  gender: z.enum(GENDERS),
  birthDate: isoDateSchema.nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  photoUrl: z.string().nullable(),
  membershipStatus: z.enum(PERSON_MEMBERSHIP_STATUSES),
  joinedAt: isoDateSchema.nullable(),
  notes: z.string().nullable(),
  userId: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Person = z.infer<typeof personSchema>;

export const personSummarySchema = personSchema.pick({
  id: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
  membershipStatus: true,
});
export type PersonSummary = z.infer<typeof personSummarySchema>;

export const personInputSchema = z.object({
  firstName: requiredText(LIMITS.nameMin, LIMITS.nameMax),
  lastName: optionalText(LIMITS.nameMax),
  gender: z.enum(GENDERS).default('unspecified'),
  birthDate: optionalDate,
  email: optionalEmail,
  phone: optionalText(LIMITS.phoneMax),
  address: optionalText(LIMITS.shortTextMax),
  photoUrl: optionalUrl,
  membershipStatus: z.enum(PERSON_MEMBERSHIP_STATUSES).default('visitor'),
  joinedAt: optionalDate,
  notes: optionalText(LIMITS.longTextMax),
});
export type PersonInput = z.infer<typeof personInputSchema>;

export const personPrivateDetailsSchema = z.object({
  personId: idSchema,
  nationalId: z.string().nullable(),
  maritalStatus: z.enum(MARITAL_STATUSES),
  baptismDate: isoDateSchema.nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  medicalNotes: z.string().nullable(),
  privateNotes: z.string().nullable(),
  updatedAt: isoDateTimeSchema,
});
export type PersonPrivateDetails = z.infer<typeof personPrivateDetailsSchema>;

export const personPrivateDetailsInputSchema = z.object({
  nationalId: optionalText(LIMITS.shortTextMax),
  maritalStatus: z.enum(MARITAL_STATUSES).default('unspecified'),
  baptismDate: optionalDate,
  emergencyContactName: optionalText(LIMITS.nameMax),
  emergencyContactPhone: optionalText(LIMITS.phoneMax),
  medicalNotes: optionalText(LIMITS.longTextMax),
  privateNotes: optionalText(LIMITS.longTextMax),
});
export type PersonPrivateDetailsInput = z.infer<typeof personPrivateDetailsInputSchema>;

export const personListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PERSON_MEMBERSHIP_STATUSES).optional(),
  groupId: idSchema.optional(),
});
export type PersonListQuery = z.infer<typeof personListQuerySchema>;

export const personListSchema = paginatedSchema(personSchema);
export type PersonList = z.infer<typeof personListSchema>;

export const personDetailSchema = z.object({
  person: personSchema,
  groups: z.array(z.object({ id: idSchema, name: z.string() })),
  linkedUser: z.object({ id: idSchema, name: z.string(), email: z.string() }).nullable(),
  privateDetails: personPrivateDetailsSchema.nullable(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canViewPrivate: z.boolean(),
  canEditPrivate: z.boolean(),
  canLinkUser: z.boolean(),
});
export type PersonDetail = z.infer<typeof personDetailSchema>;

export const linkPersonUserBodySchema = z.object({
  userId: idSchema.nullable(),
});
export type LinkPersonUserBody = z.infer<typeof linkPersonUserBodySchema>;

export const personResponseSchema = z.object({ person: personSchema });
export const personPrivateDetailsResponseSchema = z.object({
  privateDetails: personPrivateDetailsSchema,
});
