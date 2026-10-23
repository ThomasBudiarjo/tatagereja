import { checkinMeSchema } from '@tatagereja/shared';
import { Baby, CalendarRange, HeartHandshake, ScanLine, School, Smile } from 'lucide-react';
import { request } from '@/lib/api';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';
import { checkinKeys } from './api';

/** Volunteers and coordinators run the station, rosters and check-out. */
const operate: AccessRule = { anyOf: ['checkin.operate', 'checkin.manage'] };

export const checkinModule = defineModule({
  id: 'checkin',
  icon: Baby,
  accent: 'sun',
  labelKey: 'checkin.nav',
  descriptionKey: 'checkin.description',
  section: 'ministry',
  routes: [
    {
      path: 'checkin',
      lazy: lazyPage(() => import('./checkin-home-page'), 'CheckinHomePage'),
      handle: { access: operate },
    },
    {
      path: 'checkin/sessions',
      lazy: lazyPage(() => import('./sessions-page'), 'SessionsPage'),
      handle: { access: operate },
    },
    {
      path: 'checkin/sessions/:sessionId',
      lazy: lazyPage(() => import('./session-page'), 'SessionPage'),
      handle: { access: operate },
    },
    {
      path: 'checkin/sessions/:sessionId/station',
      lazy: lazyPage(() => import('./station-page'), 'StationPage'),
      handle: { access: operate },
    },
    {
      path: 'checkin/sessions/:sessionId/classes/:classId',
      lazy: lazyPage(() => import('./roster-page'), 'RosterPage'),
      handle: { access: operate },
    },
    {
      path: 'checkin/classes',
      lazy: lazyPage(() => import('./classes-page'), 'ClassesPage'),
      handle: { access: operate },
    },
    {
      path: 'checkin/children',
      lazy: lazyPage(() => import('./children-page'), 'ChildrenPage'),
      handle: { access: operate },
    },
    // Guardians open their own children, labels and phone page; the API decides what they see.
    {
      path: 'checkin/children/:personId',
      lazy: lazyPage(() => import('./child-page'), 'ChildPage'),
    },
    {
      path: 'checkin/labels',
      lazy: lazyPage(() => import('./labels-page'), 'LabelsPage'),
    },
    {
      path: 'checkin/me',
      lazy: lazyPage(() => import('./my-children-page'), 'MyChildrenPage'),
    },
  ],
  nav: [
    {
      id: 'checkin',
      to: 'checkin',
      labelKey: 'checkin.nav',
      descriptionKey: 'checkin.description',
      icon: Baby,
      order: 50,
      access: operate,
      keywords: ['sekolah minggu', 'anak', 'kids', 'check-in', 'jemput', 'guru'],
    },
    {
      id: 'checkin-me',
      to: 'checkin/me',
      labelKey: 'checkin.navMine',
      descriptionKey: 'checkin.navMineDescription',
      icon: Smile,
      order: 51,
      keywords: ['anak saya', 'sekolah minggu', 'check-in', 'kode jemput', 'my children'],
      // Children of the caller's family in class right now.
      badge: ({ churchId }) => ({
        queryKey: [...checkinKeys.me(churchId), 'badge'],
        queryFn: async () =>
          (await request(checkinMeSchema, { url: `/churches/${churchId}/checkin/me` })).current
            .length,
        staleTime: 60_000,
      }),
    },
  ],
  quickActions: [
    {
      id: 'checkin-station',
      to: 'checkin',
      labelKey: 'checkin.quickStation',
      icon: ScanLine,
      order: 40,
      access: operate,
    },
    {
      id: 'checkin-mine',
      to: 'checkin/me',
      labelKey: 'checkin.quickMine',
      icon: Smile,
      order: 60,
    },
  ],
  commands: [
    {
      id: 'checkin-sessions',
      to: 'checkin/sessions',
      labelKey: 'checkin.sessionsTitle',
      icon: CalendarRange,
      keywords: ['sesi', 'ibadah anak', 'sessions', 'riwayat'],
      access: operate,
    },
    {
      id: 'checkin-classes',
      to: 'checkin/classes',
      labelKey: 'checkin.classesTitle',
      icon: School,
      keywords: ['kelas', 'balita', 'kelas kecil', 'tunas remaja', 'guru sekolah minggu'],
      access: operate,
    },
    {
      id: 'checkin-children',
      to: 'checkin/children',
      labelKey: 'checkin.childrenTitle',
      icon: HeartHandshake,
      keywords: ['anak', 'alergi', 'penjemput', 'children', 'allergy'],
      access: operate,
    },
  ],
});
