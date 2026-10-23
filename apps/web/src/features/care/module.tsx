import {
  canModeratePrayer,
  careOverviewSchema,
  has,
  hasAny,
  isCareTeam,
  type Permission,
} from '@tatagereja/shared';
import {
  Footprints,
  HandCoins,
  HandHeart,
  HeartHandshake,
  Inbox,
  ListTodo,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { request } from '@/lib/api';
import { churchScope } from '@/lib/keys';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

const MODULE_PERMISSIONS: Permission[] = [
  'prayer.submit',
  'prayer.moderate',
  'care.view',
  'care.manage',
  'care.confidential',
  'diakonia.view',
  'diakonia.manage',
];

/**
 * Anyone holding one of the module's permissions opens its screens: every member prays and may
 * be a caregiver, visitor or task assignee, and the API returns only what they may see.
 */
const access: AccessRule = { anyOf: MODULE_PERMISSIONS };
/** The pastoral desk in the menu: the care team, diakonia and prayer moderators. */
const desk: AccessRule = {
  check: ({ access: caller }) =>
    isCareTeam(caller) ||
    canModeratePrayer(caller) ||
    hasAny(caller, ['diakonia.view', 'diakonia.manage']),
};
const manage: AccessRule = { anyOf: ['care.manage'] };
const diakonia: AccessRule = { anyOf: ['diakonia.view', 'diakonia.manage'] };

export const careModule = defineModule({
  id: 'care',
  icon: HeartHandshake,
  accent: 'rose',
  labelKey: 'care.nav',
  descriptionKey: 'care.description',
  section: 'ministry',
  routes: [
    {
      path: 'care',
      lazy: lazyPage(() => import('./care-home-page'), 'CareHomePage'),
      handle: { access },
    },
    {
      // The care team sees every case it may read; caregivers see the cases assigned to them.
      path: 'care/cases',
      lazy: lazyPage(() => import('./cases-page'), 'CasesPage'),
      handle: { access },
    },
    {
      path: 'care/cases/new',
      lazy: lazyPage(() => import('./case-form'), 'NewCasePage'),
      handle: { access: manage },
    },
    {
      path: 'care/cases/:caseId',
      lazy: lazyPage(() => import('./case-page'), 'CasePage'),
      handle: { access },
    },
    {
      path: 'care/cases/:caseId/edit',
      lazy: lazyPage(() => import('./case-form'), 'EditCasePage'),
      handle: { access },
    },
    {
      path: 'care/visits',
      lazy: lazyPage(() => import('./visits-page'), 'VisitsPage'),
      handle: { access },
    },
    {
      // Care managers, or caregivers recording a visit for their case (the API decides).
      path: 'care/visits/new',
      lazy: lazyPage(() => import('./visit-page'), 'NewVisitPage'),
      handle: { access },
    },
    {
      path: 'care/visits/:visitId',
      lazy: lazyPage(() => import('./visit-page'), 'VisitPage'),
      handle: { access },
    },
    {
      path: 'care/visits/:visitId/edit',
      lazy: lazyPage(() => import('./visit-page'), 'EditVisitPage'),
      handle: { access },
    },
    {
      path: 'care/prayer',
      lazy: lazyPage(() => import('./prayer-page'), 'PrayerPage'),
      handle: { access },
    },
    {
      path: 'care/prayer/:requestId',
      lazy: lazyPage(() => import('./prayer-page'), 'PrayerRequestPage'),
      handle: { access },
    },
    {
      // The care team sees the board; others the visitors assigned to them.
      path: 'care/follow-ups',
      lazy: lazyPage(() => import('./follow-ups-page'), 'FollowUpsPage'),
      handle: { access },
    },
    {
      path: 'care/follow-ups/:followUpId',
      lazy: lazyPage(() => import('./follow-up-page'), 'FollowUpPage'),
      handle: { access },
    },
    {
      path: 'care/tasks',
      lazy: lazyPage(() => import('./tasks-page'), 'TasksPage'),
      handle: { access },
    },
    {
      path: 'care/diakonia',
      lazy: lazyPage(() => import('./diakonia-page'), 'DiakoniaPage'),
      handle: { access: diakonia },
    },
  ],
  nav: [
    {
      id: 'care',
      to: 'care',
      labelKey: 'care.nav',
      descriptionKey: 'care.description',
      icon: HeartHandshake,
      order: 30,
      access: desk,
      keywords: ['pastoral', 'pendampingan', 'perkunjungan', 'diakonia', 'konseling', 'care'],
      // My tasks due today or overdue, plus prayer requests waiting for review.
      badge: ({ churchId }) => ({
        queryKey: [...churchScope(churchId), 'care', 'badge'],
        queryFn: async () => {
          const overview = await request(careOverviewSchema, {
            url: `/churches/${churchId}/care/overview`,
          });
          return overview.tasks.overdue + overview.tasks.dueToday + (overview.prayer.pending ?? 0);
        },
        staleTime: 60_000,
      }),
    },
    {
      id: 'prayer',
      to: 'care/prayer',
      labelKey: 'care.navPrayer',
      descriptionKey: 'care.prayerNavDescription',
      icon: Sparkles,
      tone: 'violet',
      order: 31,
      access,
      keywords: ['pokok doa', 'doa', 'prayer', 'kesaksian', 'testimony'],
    },
  ],
  quickActions: [
    {
      id: 'new-prayer',
      to: 'care/prayer?new=1',
      labelKey: 'care.newPrayer',
      icon: Sparkles,
      tone: 'violet',
      order: 60,
      access: { check: ({ access: caller }) => has(caller, 'prayer.submit') },
    },
    {
      id: 'log-visit',
      to: 'care/visits/new',
      labelKey: 'care.logVisit',
      icon: Footprints,
      tone: 'teal',
      order: 61,
      access: manage,
    },
  ],
  commands: [
    {
      id: 'new-care-case',
      to: 'care/cases/new',
      labelKey: 'care.newCase',
      icon: HandHeart,
      keywords: ['pendampingan baru', 'kasus', 'sakit', 'duka', 'konseling', 'case'],
      access: manage,
    },
    {
      id: 'care-cases',
      to: 'care/cases',
      labelKey: 'care.navCases',
      icon: HandHeart,
      keywords: ['pendampingan', 'kasus pastoral', 'cases'],
      access: { check: ({ access: caller }) => isCareTeam(caller) },
    },
    {
      id: 'care-visits',
      to: 'care/visits',
      labelKey: 'care.navVisits',
      icon: Footprints,
      keywords: ['perkunjungan', 'kunjungan', 'visits', 'rumah sakit'],
      access: { check: ({ access: caller }) => isCareTeam(caller) },
    },
    {
      id: 'new-visitor',
      to: 'care/follow-ups?new=1',
      labelKey: 'care.newFollowUp',
      icon: UserPlus,
      keywords: ['tamu baru', 'pengunjung', 'jemaat baru', 'visitor', 'guest'],
      access: manage,
    },
    {
      id: 'follow-up-board',
      to: 'care/follow-ups',
      labelKey: 'care.navFollowUps',
      icon: UserPlus,
      keywords: ['tindak lanjut', 'tamu', 'follow-up', 'pipeline'],
      access: { check: ({ access: caller }) => isCareTeam(caller) },
    },
    {
      id: 'my-care-tasks',
      to: 'care/tasks',
      labelKey: 'care.myTasks',
      icon: ListTodo,
      keywords: ['tugas', 'tindak lanjut', 'tasks', 'to do'],
      access,
    },
    {
      id: 'prayer-review',
      to: 'care/prayer?tab=moderation',
      labelKey: 'care.tabModeration',
      icon: Inbox,
      keywords: ['moderasi', 'tinjau pokok doa', 'review prayer'],
      access: { check: ({ access: caller }) => canModeratePrayer(caller) },
    },
    {
      id: 'diakonia',
      to: 'care/diakonia',
      labelKey: 'care.navDiakonia',
      icon: HandCoins,
      keywords: ['bantuan', 'diakonia', 'sosial', 'aid'],
      access: diakonia,
    },
  ],
});
