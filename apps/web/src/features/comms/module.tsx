import { can, canManageBulletins } from '@tatagereja/shared';
import {
  Bell,
  BellRing,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  FilePlus2,
  Megaphone,
  Newspaper,
  Rss,
  SquarePen,
} from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';
import { NotificationsBell } from './notifications-bell';

const viewEvents: AccessRule = { anyOf: ['events.view'] };
const viewAnnouncements: AccessRule = { anyOf: ['announcements.view'] };
const viewBulletins: AccessRule = { anyOf: ['bulletin.view', 'bulletin.manage'] };
const manageBulletins: AccessRule = { check: ({ access }) => canManageBulletins(access) };
const createEvent: AccessRule = { check: ({ access }) => can.createAnyEvent(access) };
const createAnnouncement: AccessRule = { check: ({ access }) => can.createAnyAnnouncement(access) };

export const commsModule = defineModule({
  id: 'comms',
  icon: Megaphone,
  accent: 'amber',
  labelKey: 'comms.announcements',
  descriptionKey: 'comms.announcementsDescription',
  section: 'main',
  routes: [
    {
      path: 'events',
      lazy: lazyPage(() => import('@/features/events/events-page'), 'EventsPage'),
      handle: { access: viewEvents },
    },
    {
      path: 'events/new',
      lazy: lazyPage(() => import('@/features/events/new-event-page'), 'NewEventPage'),
      handle: { access: createEvent },
    },
    {
      path: 'events/:id',
      lazy: lazyPage(() => import('@/features/events/event-page'), 'EventPage'),
      handle: { access: viewEvents },
    },
    {
      path: 'events/:id/edit',
      lazy: lazyPage(() => import('@/features/events/edit-event-page'), 'EditEventPage'),
      handle: { access: createEvent },
    },
    {
      // The page checks the event's own rule (recorders, managers, its group leader).
      path: 'events/:id/check-in',
      lazy: lazyPage(() => import('@/features/events/check-in-page'), 'CheckInPage'),
      handle: { access: viewEvents },
    },
    {
      path: 'calendar',
      lazy: lazyPage(() => import('@/features/calendar/calendar-page'), 'CalendarPage'),
    },
    {
      path: 'announcements',
      lazy: lazyPage(
        () => import('@/features/announcements/announcements-page'),
        'AnnouncementsPage',
      ),
      handle: { access: viewAnnouncements },
    },
    {
      path: 'announcements/new',
      lazy: lazyPage(
        () => import('@/features/announcements/new-announcement-page'),
        'NewAnnouncementPage',
      ),
      handle: { access: createAnnouncement },
    },
    {
      path: 'announcements/:id',
      lazy: lazyPage(
        () => import('@/features/announcements/announcement-page'),
        'AnnouncementPage',
      ),
      handle: { access: viewAnnouncements },
    },
    {
      path: 'announcements/:id/edit',
      lazy: lazyPage(
        () => import('@/features/announcements/edit-announcement-page'),
        'EditAnnouncementPage',
      ),
      handle: { access: createAnnouncement },
    },
    {
      path: 'bulletins',
      lazy: lazyPage(() => import('@/features/bulletin/bulletins-page'), 'BulletinsPage'),
      handle: { access: viewBulletins },
    },
    {
      path: 'bulletins/new',
      lazy: lazyPage(() => import('@/features/bulletin/bulletin-editor-page'), 'NewBulletinPage'),
      handle: { access: manageBulletins },
    },
    {
      path: 'bulletins/:id',
      lazy: lazyPage(() => import('@/features/bulletin/bulletin-page'), 'BulletinPage'),
      handle: { access: viewBulletins },
    },
    {
      path: 'bulletins/:id/edit',
      lazy: lazyPage(() => import('@/features/bulletin/bulletin-editor-page'), 'EditBulletinPage'),
      handle: { access: manageBulletins },
    },
    {
      path: 'notifications',
      lazy: lazyPage(
        () => import('@/features/notifications/notifications-page'),
        'NotificationsPage',
      ),
    },
    {
      path: 'notifications/settings',
      lazy: lazyPage(
        () => import('@/features/notifications/notification-settings-page'),
        'NotificationSettingsPage',
      ),
    },
  ],
  nav: [
    {
      id: 'events',
      to: 'events',
      labelKey: 'comms.events',
      descriptionKey: 'comms.eventsDescription',
      icon: CalendarDays,
      order: 20,
      access: viewEvents,
      mobileTab: 'events',
      keywords: ['kegiatan', 'acara', 'pendaftaran', 'presensi', 'registration', 'rsvp'],
    },
    {
      id: 'calendar',
      to: 'calendar',
      labelKey: 'comms.calendar',
      descriptionKey: 'comms.calendarDescription',
      icon: CalendarRange,
      tone: 'sky',
      order: 25,
      keywords: ['kalender', 'jadwal', 'agenda', 'ibadah', 'ulang tahun', 'ical'],
    },
    {
      id: 'announcements',
      to: 'announcements',
      labelKey: 'comms.announcements',
      descriptionKey: 'comms.announcementsDescription',
      icon: Megaphone,
      order: 30,
      access: viewAnnouncements,
      keywords: ['pengumuman', 'berita', 'kabar', 'news'],
    },
    {
      id: 'bulletins',
      to: 'bulletins',
      labelKey: 'comms.bulletins',
      descriptionKey: 'comms.bulletinsDescription',
      icon: Newspaper,
      order: 40,
      access: viewBulletins,
      keywords: ['warta', 'warta jemaat', 'bulletin', 'mingguan', 'cetak'],
    },
  ],
  quickActions: [
    {
      id: 'new-event',
      to: 'events/new',
      labelKey: 'comms.newEvent',
      icon: CalendarPlus,
      order: 10,
      access: createEvent,
    },
    {
      id: 'new-announcement',
      to: 'announcements/new',
      labelKey: 'comms.newAnnouncement',
      icon: SquarePen,
      order: 20,
      access: createAnnouncement,
    },
    {
      id: 'new-bulletin',
      to: 'bulletins/new',
      labelKey: 'comms.bulletinNew',
      icon: FilePlus2,
      order: 30,
      access: manageBulletins,
    },
  ],
  commands: [
    {
      id: 'new-event',
      to: 'events/new',
      labelKey: 'comms.newEvent',
      icon: CalendarPlus,
      keywords: ['buat', 'baru', 'new', 'create', 'kegiatan rutin', 'series'],
      access: createEvent,
    },
    {
      id: 'new-announcement',
      to: 'announcements/new',
      labelKey: 'comms.newAnnouncement',
      icon: SquarePen,
      keywords: ['buat', 'baru', 'new', 'post', 'pengumuman'],
      access: createAnnouncement,
    },
    {
      id: 'new-bulletin',
      to: 'bulletins/new',
      labelKey: 'comms.bulletinNew',
      icon: FilePlus2,
      keywords: ['warta', 'buat', 'baru', 'new'],
      access: manageBulletins,
    },
    {
      id: 'notifications',
      to: 'notifications',
      labelKey: 'common.notifications',
      icon: Bell,
      keywords: ['pemberitahuan', 'notifikasi', 'inbox', 'kotak masuk'],
    },
    {
      id: 'notification-settings',
      to: 'notifications/settings',
      labelKey: 'comms.notificationSettings',
      icon: BellRing,
      keywords: ['pengaturan', 'preferensi', 'preferences', 'mute'],
    },
    {
      id: 'calendar-subscribe',
      to: 'calendar',
      labelKey: 'comms.feedsTitle',
      icon: Rss,
      keywords: ['ical', 'ics', 'google calendar', 'langganan', 'subscribe'],
    },
  ],
  topBar: [NotificationsBell],
});
