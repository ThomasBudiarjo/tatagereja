import { churchQuery } from '@/features/churches/api';
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

/**
 * Runs `task` once the current screen has its data (no query loading) and the main thread is
 * idle, or after `maxWait`: speculative downloads must not compete with what is on screen
 * for a 3G connection's bandwidth.
 */
export function whenQuiet(task: () => void, maxWait = 10_000): void {
  const started = Date.now();
  const check = () => {
    if (queryClient.isFetching() === 0 || Date.now() - started > maxWait) whenIdle(task);
    else setTimeout(check, 500);
  };
  setTimeout(check, 500);
}

const quietly = (promise: Promise<unknown>) => void promise.catch(() => undefined);

/**
 * On the first visit to a church: its detail (every screen waits for it) and, for its home
 * page, the home screen code and the dashboard, all while the registry downloads.
 */
export function prefetchFirstChurchScreen(churchId: string, path: string): void {
  quietly(queryClient.prefetchQuery(churchQuery(churchId)));
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
  whenQuiet(() => {
    quietly(loadDictionaries());
    quietly(loadChurchRoutes());
    quietly(loadHomeScreen());
  });
}
