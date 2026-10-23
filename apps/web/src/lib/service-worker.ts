import { toast } from 'sonner';
import { t } from '@/lib/i18n';
import { sessionOf, useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';

/*
 * The page side of the service worker (`service-worker.js`, built to `/sw.js`): registration
 * in production builds, the "Versi baru tersedia — Muat ulang" prompt, and which account's API
 * answers it may keep for offline use. Signing out deletes them (`clearOfflineData`).
 */

const SCRIPT_URL = '/sw.js';
const API_CACHE_PREFIX = 'tg-api:';
/** How often an open app asks whether a new version was released. */
const UPDATE_CHECK_MS = 30 * 60_000;

type ScriptUrlPolicy = { createScriptURL: (url: string) => string };
type TrustedTypesFactory = {
  createPolicy: (name: string, rules: { createScriptURL: (url: string) => string }) => unknown;
};

/**
 * The server's Content Security Policy requires Trusted Types: `serviceWorker.register` only
 * takes a script URL made by a policy. This one lets exactly `/sw.js` through.
 */
function scriptUrl(): string {
  const factory = (window as { trustedTypes?: TrustedTypesFactory }).trustedTypes;
  if (!factory) return SCRIPT_URL;
  const policy = factory.createPolicy('tatagereja-service-worker', {
    createScriptURL: (url) => {
      if (url !== SCRIPT_URL) throw new TypeError('Only the app service worker may register');
      return url;
    },
  }) as ScriptUrlPolicy;
  return policy.createScriptURL(SCRIPT_URL);
}

let account: string | null = null;

const post = (message: unknown) => navigator.serviceWorker?.controller?.postMessage(message);

/**
 * The account signed in to this origin's server. Other servers are reached cross-origin,
 * which the service worker never handles.
 */
const signedInAccount = (): string | null => {
  const serverUrl = useServerStore.getState().currentUrl;
  if (serverUrl !== window.location.origin) return null;
  return sessionOf(serverUrl)?.user.id ?? null;
};

/** Tells the service worker whose answers it may keep (`null` when signed out). */
export function announceAccount(id: string | null): void {
  account = id;
  post({ type: 'account', id });
}

/** Deletes every API answer kept for offline use, whoever's it was. */
export async function clearOfflineData(): Promise<void> {
  announceAccount(null);
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names.filter((name) => name.startsWith(API_CACHE_PREFIX)).map((name) => caches.delete(name)),
  );
}

/** The person chose "Muat ulang": reload once the new version controls the page. */
let updateRequested = false;

function promptUpdate(waiting: ServiceWorker) {
  toast(t('common.updateAvailable'), {
    id: 'app-update',
    description: t('common.updateDescription'),
    duration: Infinity,
    action: {
      label: t('common.updateReload'),
      onClick: () => {
        updateRequested = true;
        waiting.postMessage({ type: 'skip-waiting' });
      },
    },
  });
}

/** Registers the service worker once the page has loaded (never in the dev server). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;
  // The new version took over after "Muat ulang": load the page it serves. (The first
  // install also takes over, silently: nothing changed for the page.)
  let reloading = false;
  container.addEventListener('controllerchange', () => {
    if (reloading || !updateRequested) return;
    reloading = true;
    window.location.reload();
  });
  // The worker restarted without memory of the account: say it again.
  container.addEventListener('controllerchange', () => post({ type: 'account', id: account }));

  announceAccount(signedInAccount());
  const follow = () => {
    const next = signedInAccount();
    if (next !== account) announceAccount(next);
  };
  useAuthStore.subscribe(follow);
  useServerStore.subscribe(follow);

  const register = async () => {
    try {
      const registration = await container.register(scriptUrl(), { scope: '/' });
      post({ type: 'account', id: account });
      const watch = (worker: ServiceWorker | null) => {
        worker?.addEventListener('statechange', () => {
          // Installed while an older version controls the page: a release is ready.
          if (worker.state === 'installed' && container.controller) promptUpdate(worker);
        });
      };
      if (registration.waiting && container.controller) promptUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      const check = () => void registration.update().catch(() => undefined);
      setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}
