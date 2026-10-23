import {
  CalendarPlus,
  CalendarRange,
  ListMusic,
  Music,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { request } from '@/lib/api';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';
import { worshipMeSchema } from '@tatagereja/shared';
import { worshipKeys } from './api';

/** Anyone holding one of the module's permissions sees it. */
const access: AccessRule = { anyOf: ['services.view', 'services.manage', 'volunteers.schedule'] };
/** Planning services, the liturgy, songs and the team structure. */
const manage: AccessRule = { anyOf: ['services.manage'] };

export const worshipModule = defineModule({
  id: 'worship',
  icon: Music,
  accent: 'violet',
  labelKey: 'worship.nav',
  descriptionKey: 'worship.description',
  section: 'ministry',
  routes: [
    {
      path: 'worship',
      lazy: lazyPage(() => import('./worship-home-page'), 'WorshipHomePage'),
      handle: { access },
    },
    {
      path: 'worship/services',
      lazy: lazyPage(() => import('./services-page'), 'ServicesPage'),
      handle: { access },
    },
    {
      path: 'worship/services/new',
      lazy: lazyPage(() => import('./service-form-page'), 'NewServicePage'),
      handle: { access: manage },
    },
    {
      path: 'worship/services/:serviceId',
      lazy: lazyPage(() => import('./service-page'), 'ServicePage'),
      handle: { access },
    },
    {
      path: 'worship/services/:serviceId/edit',
      lazy: lazyPage(() => import('./service-form-page'), 'EditServicePage'),
      handle: { access: manage },
    },
    {
      path: 'worship/services/:serviceId/print',
      lazy: lazyPage(() => import('./run-sheet-page'), 'RunSheetPage'),
      handle: { access },
    },
    {
      path: 'worship/types',
      lazy: lazyPage(() => import('./service-types-page'), 'ServiceTypesPage'),
      handle: { access: manage },
    },
    {
      path: 'worship/songs',
      lazy: lazyPage(() => import('./songs-page'), 'SongsPage'),
      handle: { access },
    },
    {
      path: 'worship/songs/new',
      lazy: lazyPage(() => import('./song-form-page'), 'NewSongPage'),
      handle: { access: manage },
    },
    {
      path: 'worship/songs/:songId',
      lazy: lazyPage(() => import('./song-page'), 'SongPage'),
      handle: { access },
    },
    {
      path: 'worship/songs/:songId/edit',
      lazy: lazyPage(() => import('./song-form-page'), 'EditSongPage'),
      handle: { access: manage },
    },
    {
      path: 'worship/teams',
      lazy: lazyPage(() => import('./teams-page'), 'TeamsPage'),
      handle: { access },
    },
    {
      path: 'worship/teams/:teamId',
      lazy: lazyPage(() => import('./team-page'), 'TeamPage'),
      handle: { access },
    },
    {
      path: 'worship/me',
      lazy: lazyPage(() => import('./my-schedule-page'), 'MySchedulePage'),
      handle: { access },
    },
  ],
  nav: [
    {
      id: 'worship',
      to: 'worship',
      labelKey: 'worship.nav',
      descriptionKey: 'worship.description',
      icon: Music,
      order: 20,
      access,
      keywords: ['ibadah', 'liturgi', 'tata ibadah', 'kebaktian', 'worship', 'services'],
    },
    {
      id: 'worship-me',
      to: 'worship/me',
      labelKey: 'worship.navMySchedule',
      descriptionKey: 'worship.navMyScheduleDescription',
      icon: UserRoundCheck,
      order: 21,
      access,
      keywords: ['jadwal pelayanan', 'tugas', 'roster', 'serving', 'my schedule', 'berhalangan'],
      // Assignments still waiting for the caller's reply.
      badge: ({ churchId }) => ({
        queryKey: [...worshipKeys.me(churchId), 'badge'],
        queryFn: async () =>
          (await request(worshipMeSchema, { url: `/churches/${churchId}/worship/me` }))
            .pendingCount,
        staleTime: 60_000,
      }),
    },
  ],
  quickActions: [
    {
      id: 'plan-service',
      to: 'worship/services/new',
      labelKey: 'worship.planService',
      icon: CalendarPlus,
      order: 30,
      access: manage,
    },
    {
      id: 'my-serving',
      to: 'worship/me',
      labelKey: 'worship.navMySchedule',
      icon: UserRoundCheck,
      order: 31,
      access,
    },
  ],
  commands: [
    {
      id: 'worship-services',
      to: 'worship/services',
      labelKey: 'worship.servicesTitle',
      icon: CalendarRange,
      keywords: ['ibadah', 'kebaktian', 'services', 'minggu'],
      access,
    },
    {
      id: 'worship-songs',
      to: 'worship/songs',
      labelKey: 'worship.songsTitle',
      icon: ListMusic,
      keywords: ['lagu', 'kidung jemaat', 'kj', 'pkj', 'nkb', 'songs', 'hymns'],
      access,
    },
    {
      id: 'worship-teams',
      to: 'worship/teams',
      labelKey: 'worship.teamsTitle',
      icon: UsersRound,
      keywords: ['tim pelayanan', 'pemusik', 'multimedia', 'penerima tamu', 'teams'],
      access,
    },
    {
      id: 'worship-new-song',
      to: 'worship/songs/new',
      labelKey: 'worship.newSong',
      icon: ListMusic,
      keywords: ['tambah lagu', 'add song'],
      access: manage,
    },
    {
      id: 'worship-types',
      to: 'worship/types',
      labelKey: 'worship.typesTitle',
      icon: CalendarRange,
      keywords: ['jenis ibadah', 'service types'],
      access: manage,
    },
  ],
});
