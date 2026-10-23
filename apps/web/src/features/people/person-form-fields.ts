import type { CustomFieldDefinition } from '@tatagereja/shared';

/** Form field names that `422` issues from the person endpoints can map onto. */
export const personFormFieldNames = (fields: readonly Pick<CustomFieldDefinition, 'id'>[]) => [
  'firstName',
  'lastName',
  'gender',
  'birthDate',
  'email',
  'phone',
  'address',
  'photoUrl',
  'membershipStatus',
  'joinedAt',
  'weddingDate',
  'notes',
  'tagIds',
  ...fields.map((field) => `customFields.${field.id}`),
];
