import type { QueryClient } from '@tanstack/react-query';
import { churchScope, keys } from '@/lib/keys';

/**
 * Query keys of the comms module. Announcements and events keep the shared `keys.*` roots so
 * the home dashboard and group pages refresh with them; notifications are per account (they
 * span churches), so they live under `['notifications']`.
 */
export const commsKeys = {
  notifications: () => ['notifications'] as const,
  notificationList: (params: Record<string, unknown>) => ['notifications', 'list', params] as const,
  unreadCount: (churchId?: string) => ['notifications', 'unread', churchId ?? 'all'] as const,
  preferences: () => ['notifications', 'preferences'] as const,
  calendar: (churchId: string) => [...churchScope(churchId), 'calendar'] as const,
  calendarRange: (churchId: string, params: Record<string, unknown>) =>
    [...churchScope(churchId), 'calendar', 'range', params] as const,
  feeds: (churchId: string) => [...churchScope(churchId), 'calendar', 'feeds'] as const,
  bulletins: (churchId: string) => [...churchScope(churchId), 'bulletins'] as const,
  bulletinList: (churchId: string, params: Record<string, unknown>) =>
    [...churchScope(churchId), 'bulletins', 'list', params] as const,
  bulletin: (churchId: string, id: string) =>
    [...churchScope(churchId), 'bulletins', 'detail', id] as const,
  bulletinSources: (churchId: string, issueDate: string) =>
    [...churchScope(churchId), 'bulletins', 'sources', issueDate] as const,
  audienceOptions: (churchId: string) =>
    [...churchScope(churchId), 'announcements', 'audience-options'] as const,
  readers: (churchId: string, id: string) =>
    [...churchScope(churchId), 'announcements', 'readers', id] as const,
  registrations: (churchId: string, id: string) =>
    [...churchScope(churchId), 'events', 'registrations', id] as const,
  checkIn: (churchId: string, id: string) =>
    [...churchScope(churchId), 'events', 'check-in', id] as const,
};

/** The inbox, the bell and every other module's notification queries. */
export const invalidateNotifications = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: commsKeys.notifications() });

/**
 * Events move the event lists and details, the calendar, the home dashboard, group pages
 * (upcoming events), attendance (check-in) and the inbox (organisers and attendees are told).
 */
export const invalidateEvents = (client: QueryClient, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: keys.events(churchId) }),
    client.invalidateQueries({ queryKey: commsKeys.calendar(churchId) }),
    client.invalidateQueries({ queryKey: keys.dashboard(churchId) }),
    client.invalidateQueries({ queryKey: keys.groups(churchId) }),
    client.invalidateQueries({ queryKey: keys.attendance(churchId) }),
    client.invalidateQueries({ queryKey: commsKeys.bulletins(churchId) }),
    invalidateNotifications(client),
  ]);

/** Announcements also show on the dashboard, group pages and in bulletins. */
export const invalidateAnnouncements = (client: QueryClient, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: keys.announcements(churchId) }),
    client.invalidateQueries({ queryKey: keys.dashboard(churchId) }),
    client.invalidateQueries({ queryKey: keys.groups(churchId) }),
    client.invalidateQueries({ queryKey: commsKeys.bulletins(churchId) }),
    invalidateNotifications(client),
  ]);
