import { can } from '@tatagereja/shared';
import { CalendarDays, CalendarPlus, Megaphone, Newspaper, SquarePen } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';
import { NotificationsBell } from './notifications-bell';

const viewEvents: AccessRule = { anyOf: ['events.view'] };
const viewAnnouncements: AccessRule = { anyOf: ['announcements.view'] };
const viewBulletins: AccessRule = { anyOf: ['bulletin.view', 'bulletin.manage'] };
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
      path: 'bulletins',
      lazy: lazyPage(() => import('./bulletins-page'), 'BulletinsPage'),
      handle: { access: viewBulletins },
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
      keywords: ['kegiatan', 'acara', 'kalender', 'calendar', 'ibadah'],
    },
    {
      id: 'announcements',
      to: 'announcements',
      labelKey: 'comms.announcements',
      descriptionKey: 'comms.announcementsDescription',
      icon: Megaphone,
      order: 30,
      access: viewAnnouncements,
      keywords: ['pengumuman', 'berita', 'news'],
    },
    {
      id: 'bulletins',
      to: 'bulletins',
      labelKey: 'comms.bulletins',
      descriptionKey: 'comms.bulletinsDescription',
      icon: Newspaper,
      order: 40,
      access: viewBulletins,
      keywords: ['warta', 'warta jemaat', 'bulletin', 'mingguan'],
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
  ],
  commands: [
    {
      id: 'new-event',
      to: 'events/new',
      labelKey: 'comms.newEvent',
      icon: CalendarPlus,
      keywords: ['buat', 'baru', 'new', 'create'],
      access: createEvent,
    },
    {
      id: 'new-announcement',
      to: 'announcements/new',
      labelKey: 'comms.newAnnouncement',
      icon: SquarePen,
      keywords: ['buat', 'baru', 'new', 'post'],
      access: createAnnouncement,
    },
  ],
  topBar: [NotificationsBell],
});
