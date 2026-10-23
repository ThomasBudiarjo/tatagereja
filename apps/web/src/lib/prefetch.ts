import { loadDictionaries } from './i18n';
import { queryClient } from './query-client';

/*
 * Starting downloads before they are needed. A phone on 3G waits about half a second for
 * every round trip, so screens fetch their code and data side by side, and the code of the
 * likely next screen comes in idle time.
 */

/** The church shell, the module registry and every church route definition (one chunk). */
export const loadChurchRoutes = () => import('@/church-routes');

/** The church's home screen: where the app opens, after signing in and from the app icon. */
const loadHomeScreen = () => import('@/features/dashboard/home-page');

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

/** No speculative downloads when the person asked the browser to save data, or on 2G. */
export const mayPrefetch = (): boolean => {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!connection) return true;
  return !connection.saveData && !/(^|-)2g$/.test(connection.effectiveType ?? '');
};

/** Runs `task` when the main thread is idle (after the current screen has painted). */
export function whenIdle(task: () => void, timeout = 2000): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout });
  } else {
    setTimeout(task, 300);
  }
}

const quietly = (promise: Promise<unknown>) => void promise.catch(() => undefined);

/**
 * On the first visit to a church: its detail (every screen waits for it) and, for its home
 * page, the home screen code and the dashboard, all while the registry downloads.
 */
export function prefetchFirstChurchScreen(churchId: string, path: string): void {
  quietly(
    import('@/features/churches/api').then(({ churchQuery }) =>
      queryClient.prefetchQuery(churchQuery(churchId)),
    ),
  );
  if (path.replace(/\/+$/, '') !== `/c/${churchId}`) return;
  quietly(loadHomeScreen());
  quietly(
    import('@/features/dashboard/api').then(({ dashboardQuery }) =>
      queryClient.prefetchQuery(dashboardQuery(churchId)),
    ),
  );
}

/**
 * The code a signed-in person needs next, fetched in idle time on the sign-in screens: the
 * dictionaries, the church shell and the home screen. Each import is a no-op once downloaded.
 */
export function prefetchSignedInShell(): void {
  if (!mayPrefetch()) return;
  whenIdle(() => {
    quietly(loadDictionaries());
    quietly(loadChurchRoutes());
    quietly(loadHomeScreen());
  });
}
