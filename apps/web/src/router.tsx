import { createBrowserRouter } from 'react-router';
import { AppSplash } from '@/components/layout/app-splash';
import { ChurchProvider } from '@/components/layout/church-provider';
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RootRedirect,
} from '@/components/layout/require-auth';
import { RootLayout } from '@/components/layout/root-layout';
import { AccountShell, AppShell } from '@/components/layout/shells';
import { LoginPage } from '@/features/auth/login-page';
import { RegisterPage } from '@/features/auth/register-page';
import { ServerPage } from '@/features/auth/server-page';
import { WelcomePage } from '@/features/auth/welcome-page';
import { JoinPage } from '@/features/invitations/join-page';
import { NotFoundPage } from '@/features/not-found-page';
import { CHURCH_ROUTES } from '@/features/registry';
import { lazyPage } from '@/lib/modules';

const churchShell = (
  <ChurchProvider>
    <AppShell />
  </ChurchProvider>
);

/** Account and auth routes are fixed; every route inside a church comes from the module registry. */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    hydrateFallbackElement: <AppSplash />,
    children: [
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
            children: [...CHURCH_ROUTES, { path: '*', element: <NotFoundPage embedded /> }],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
