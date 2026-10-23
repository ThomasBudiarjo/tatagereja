import type { RouteObject } from 'react-router';
import { ChurchProvider } from '@/components/layout/church-provider';
import { AppShell } from '@/components/layout/shells';
import { NotFoundPage } from '@/features/not-found-page';
import { CHURCH_ROUTES } from '@/features/registry';

/*
 * Everything under `/c/:churchId`: the church shell, the module registry and every module
 * route. `router.tsx` loads this chunk on the first visit to a church, so the sign-in screens
 * never download the menus, manifests and badge queries of eleven modules.
 */

export const CHURCH_SHELL = (
  <ChurchProvider>
    <AppShell />
  </ChurchProvider>
);

export const CHURCH_CHILDREN: RouteObject[] = [
  ...CHURCH_ROUTES,
  { path: '*', element: <NotFoundPage embedded /> },
];
