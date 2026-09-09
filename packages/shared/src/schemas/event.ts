import { z } from 'zod';
import { LIMITS, PARTICIPANT_STATUSES } from '../constants';
import {
  idSchema,
  isoDateTimeSchema,
  optionalDateTime,
  optionalText,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
} from './common';
import { personSummarySchema } from './person';

export const eventSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  groupId: idSchema.nullable(),
  groupName: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable(),
  isAllDay: z.boolean(),
  participantCount: z.number().int().nonnegative(),
  createdBy: idSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Event = z.infer<typeof eventSchema>;

export const eventInputSchema = z
  .object({
    title: requiredText(2, LIMITS.nameMax),
    description: optionalText(LIMITS.longTextMax),
    location: optionalText(LIMITS.shortTextMax),
    groupId: idSchema.nullable().default(null),
    startsAt: isoDateTimeSchema,
    endsAt: optionalDateTime,
    isAllDay: z.boolean().default(false),
  })
  .refine(
    (value) =>
      !value.endsAt || new Date(value.endsAt).getTime() >= new Date(value.startsAt).getTime(),
    { message: 'End time must be after the start time', path: ['endsAt'] },
  );
export type EventInput = z.infer<typeof eventInputSchema>;

export const eventListQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  groupId: idSchema.optional(),
});
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export const eventListSchema = paginatedSchema(eventSchema);
export type EventList = z.infer<typeof eventListSchema>;

export const eventParticipantSchema = personSummarySchema.extend({
  status: z.enum(PARTICIPANT_STATUSES),
});
export type EventParticipant = z.infer<typeof eventParticipantSchema>;

export const attendanceSessionSummarySchema = z.object({
  id: idSchema,
  title: z.string(),
  sessionAt: isoDateTimeSchema,
  presentCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
});

export const eventDetailSchema = z.object({
  event: eventSchema,
  participants: z.array(eventParticipantSchema),
  sessions: z.array(attendanceSessionSummarySchema),
  canManage: z.boolean(),
  canRecordAttendance: z.boolean(),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;

export const setParticipantsBodySchema = z.object({
  personIds: z.array(idSchema).min(1).max(1000),
  status: z.enum(PARTICIPANT_STATUSES).default('invited'),
});
export type SetParticipantsBody = z.infer<typeof setParticipantsBodySchema>;

export const updateParticipantBodySchema = z.object({
  status: z.enum(PARTICIPANT_STATUSES),
});

export const eventResponseSchema = z.object({ event: eventSchema });
