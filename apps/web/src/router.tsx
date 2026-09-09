import { createBrowserRouter, Navigate } from 'react-router';
import { ChurchProvider } from '@/components/layout/church-provider';
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RootRedirect,
} from '@/components/layout/require-auth';
import { AccountShell, AppShell } from '@/components/layout/shells';
import { PageLoader } from '@/components/ui/misc';
import { LoginPage } from '@/features/auth/login-page';
import { RegisterPage } from '@/features/auth/register-page';
import { ServerPage } from '@/features/auth/server-page';
import { WelcomePage } from '@/features/auth/welcome-page';
import { JoinPage } from '@/features/invitations/join-page';
import { NotFoundPage } from '@/features/not-found-page';

/** Feature screens load on demand so the first paint stays small on mobile connections. */
const lazyPage =
  <T extends string>(loader: () => Promise<Record<T, React.ComponentType>>, name: T) =>
  async () => ({ Component: (await loader())[name] });

const churchShell = (
  <ChurchProvider>
    <AppShell />
  </ChurchProvider>
);

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/join/:token', element: <JoinPage /> },
  {
    element: <RedirectIfAuthenticated />,
    children: [
      { path: '/welcome', element: <WelcomePage /> },
      { path: '/server', element: <ServerPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    hydrateFallbackElement: <PageLoader />,
    children: [
      {
        element: <AccountShell />,
        children: [
          {
            path: '/churches',
            lazy: lazyPage(() => import('@/features/churches/churches-page'), 'ChurchesPage'),
          },
          {
            path: '/churches/new',
            lazy: lazyPage(
              () => import('@/features/churches/create-church-page'),
              'CreateChurchPage',
            ),
          },
          {
            path: '/profile',
            lazy: lazyPage(() => import('@/features/profile/profile-page'), 'ProfilePage'),
          },
        ],
      },
      {
        path: '/c/:churchId',
        element: churchShell,
        children: [
          {
            index: true,
            lazy: lazyPage(() => import('@/features/dashboard/home-page'), 'HomePage'),
          },
          {
            path: 'more',
            lazy: lazyPage(() => import('@/features/dashboard/more-page'), 'MorePage'),
          },
          {
            path: 'people',
            lazy: lazyPage(() => import('@/features/people/people-page'), 'PeoplePage'),
          },
          {
            path: 'people/new',
            lazy: lazyPage(() => import('@/features/people/new-person-page'), 'NewPersonPage'),
          },
          {
            path: 'people/:id',
            lazy: lazyPage(() => import('@/features/people/person-page'), 'PersonPage'),
          },
          {
            path: 'people/:id/edit',
            lazy: lazyPage(() => import('@/features/people/edit-person-page'), 'EditPersonPage'),
          },
          {
            path: 'groups',
            lazy: lazyPage(() => import('@/features/groups/groups-page'), 'GroupsPage'),
          },
          {
            path: 'groups/:id',
            lazy: lazyPage(() => import('@/features/groups/group-page'), 'GroupPage'),
          },
          {
            path: 'events',
            lazy: lazyPage(() => import('@/features/events/events-page'), 'EventsPage'),
          },
          {
            path: 'events/new',
            lazy: lazyPage(() => import('@/features/events/new-event-page'), 'NewEventPage'),
          },
          {
            path: 'events/:id',
            lazy: lazyPage(() => import('@/features/events/event-page'), 'EventPage'),
          },
          {
            path: 'attendance',
            lazy: lazyPage(() => import('@/features/attendance/attendance-page'), 'AttendancePage'),
          },
          {
            path: 'attendance/:id',
            lazy: lazyPage(
              () => import('@/features/attendance/attendance-session-page'),
              'AttendanceSessionPage',
            ),
          },
          {
            path: 'announcements',
            lazy: lazyPage(
              () => import('@/features/announcements/announcements-page'),
              'AnnouncementsPage',
            ),
          },
          {
            path: 'announcements/new',
            lazy: lazyPage(
              () => import('@/features/announcements/new-announcement-page'),
              'NewAnnouncementPage',
            ),
          },
          {
            path: 'announcements/:id',
            lazy: lazyPage(
              () => import('@/features/announcements/announcement-page'),
              'AnnouncementPage',
            ),
          },
          {
            path: 'settings',
            lazy: lazyPage(() => import('@/features/churches/settings-page'), 'ChurchSettingsPage'),
          },
          { path: '*', element: <Navigate to="." replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
