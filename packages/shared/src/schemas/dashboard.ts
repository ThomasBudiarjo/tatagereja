import { z } from 'zod';
import { announcementSchema } from './announcement';
import { eventSchema } from './event';
import { groupSummarySchema } from './group';

export const dashboardSchema = z.object({
  stats: z.object({
    people: z.number().int().nonnegative(),
    activeGroups: z.number().int().nonnegative(),
    upcomingEvents: z.number().int().nonnegative(),
    members: z.number().int().nonnegative(),
  }),
  upcomingEvents: z.array(eventSchema),
  recentAnnouncements: z.array(announcementSchema),
  myGroups: z.array(groupSummarySchema.extend({ isLeader: z.boolean() })),
  birthdaysThisMonth: z.array(
    z.object({
      personId: z.string(),
      name: z.string(),
      birthDate: z.string(),
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
