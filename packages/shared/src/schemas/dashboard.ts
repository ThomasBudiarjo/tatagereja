import { z } from 'zod';
import { announcementSchema } from './announcement';
import { attendanceStreakSchema, dashboardPreferencesSchema, HOME_WIDGETS } from './insights';
import { careTaskSchema } from './care';
import { checkinSchema } from './checkin';
import { idSchema, isoDateTimeSchema } from './common';
import { eventSchema } from './event';
import { groupSummarySchema } from './group';
import { upcomingCelebrationSchema } from './people';
import { myScheduleItemSchema } from './worship';

/**
 * The personalised home screen. Each widget block is null when the widget is not available to
 * the caller (module switched off, permission missing) and an empty list when there is nothing
 * to show, so the interface can tell "hidden" from "empty".
 */
export const dashboardSchema = z.object({
  stats: z.object({
    people: z.number().int().nonnegative(),
    activeGroups: z.number().int().nonnegative(),
    upcomingEvents: z.number().int().nonnegative(),
    members: z.number().int().nonnegative(),
  }),
  /** Widgets to render, in the caller's order (hidden ones left out). */
  widgets: z.array(z.enum(HOME_WIDGETS)),
  /** Every widget the caller could show, for the customise sheet. */
  availableWidgets: z.array(z.enum(HOME_WIDGETS)),
  preferences: dashboardPreferencesSchema,
  mySchedule: z.array(myScheduleItemSchema).nullable(),
  myTasks: z
    .object({
      items: z.array(careTaskSchema),
      openCount: z.number().int().nonnegative(),
      overdueCount: z.number().int().nonnegative(),
    })
    .nullable(),
  myKids: z.array(checkinSchema).nullable(),
  upcomingEvents: z.array(eventSchema).nullable(),
  announcements: z
    .object({ pinned: z.array(announcementSchema), latest: z.array(announcementSchema) })
    .nullable(),
  celebrations: z.array(upcomingCelebrationSchema).nullable(),
  notifications: z.object({
    unreadCount: z.number().int().nonnegative(),
    items: z.array(
      z.object({
        id: idSchema,
        type: z.string(),
        title: z.string(),
        body: z.string().nullable(),
        link: z.string().nullable(),
        createdAt: isoDateTimeSchema,
      }),
    ),
  }),
  attendance: z.object({
    /** The caller's own streak; null without a linked person record. */
    mine: attendanceStreakSchema.nullable(),
    /** Recent sessions the caller oversees, newest first; null without attendance access. */
    recent: z
      .array(
        z.object({
          id: idSchema,
          title: z.string(),
          sessionAt: isoDateTimeSchema,
          groupName: z.string().nullable(),
          attendeeCount: z.number().int().nonnegative(),
        }),
      )
      .nullable(),
    /** People with an open absence alert (default threshold); null when the caller cannot see them. */
    openAbsences: z.number().int().nonnegative().nullable(),
  }),
  myGroups: z.array(groupSummarySchema.extend({ isLeader: z.boolean() })),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
