import { createBrowserRouter } from 'react-router';
import { AppSplash } from '@/components/layout/app-splash';
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RootRedirect,
} from '@/components/layout/require-auth';
import { RootLayout } from '@/components/layout/root-layout';
import { LoginPage } from '@/features/auth/login-page';
import { WelcomePage } from '@/features/auth/welcome-page';
import { NotFoundPage } from '@/features/not-found-page';
import { loadDictionaries } from '@/lib/i18n';
import { lazyPage } from '@/lib/modules';
import { loadChurchRoutes, prefetchFirstChurchScreen } from '@/lib/prefetch';

/**
 * Account and auth routes are fixed; every route inside a church comes from the module
 * registry. Only the welcome and sign-in screens are in the first download: the church routes
 * (`church-routes.tsx`) are patched in on the first visit to a church, and every other screen
 * is its own chunk.
 */
const CHURCH_ROUTE_ID = 'church';
const CHURCH_PATH = /^\/c\/([^/]+)/;
let churchRoutesPatched = false;

export const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      hydrateFallbackElement: <AppSplash />,
      children: [
        { path: '/', element: <RootRedirect /> },
        {
          path: '/join/:token',
          lazy: lazyPage(() => import('@/features/invitations/join-page'), 'JoinPage'),
        },
        {
          path: '/reset-password/:token',
          lazy: lazyPage(() => import('@/features/auth/reset-password-page'), 'ResetPasswordPage'),
        },
        {
          element: <RedirectIfAuthenticated />,
          children: [
            { path: '/welcome', element: <WelcomePage /> },
            { path: '/login', element: <LoginPage /> },
            {
              path: '/server',
              lazy: lazyPage(() => import('@/features/auth/server-page'), 'ServerPage'),
            },
            {
              path: '/register',
              lazy: lazyPage(() => import('@/features/auth/register-page'), 'RegisterPage'),
            },
            {
              path: '/forgot-password',
              lazy: lazyPage(
                () => import('@/features/auth/forgot-password-page'),
                'ForgotPasswordPage',
              ),
            },
          ],
        },
        {
          element: <RequireAuth />,
          children: [
            {
              lazy: lazyPage(() => import('@/components/layout/shells'), 'AccountShell'),
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
              id: CHURCH_ROUTE_ID,
              path: '/c/:churchId',
              lazy: async () => {
                const [{ CHURCH_SHELL }] = await Promise.all([
                  loadChurchRoutes(),
                  loadDictionaries(),
                ]);
                return { element: CHURCH_SHELL };
              },
            },
          ],
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  {
    async patchRoutesOnNavigation({ path, patch, signal }) {
      const churchId = CHURCH_PATH.exec(path)?.[1];
      if (!churchId || churchRoutesPatched) return;
      // The church, the messages and the likely first screen download while the registry
      // does, instead of one after the other. Matching only needs the registry: the screen's
      // code starts as soon as it is there (`lazyPage` waits for the messages).
      prefetchFirstChurchScreen(churchId, path);
      void loadDictionaries().catch(() => undefined);
      const { CHURCH_CHILDREN } = await loadChurchRoutes();
      if (signal.aborted) return;
      patch(CHURCH_ROUTE_ID, CHURCH_CHILDREN);
      churchRoutesPatched = true;
    },
  },
);
