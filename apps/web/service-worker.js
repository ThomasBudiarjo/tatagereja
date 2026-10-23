/*
 * The TataGereja service worker (built to `dist/sw.js` by `vite.config.ts`, which fills in
 * the version and the list of files to precache).
 *
 * - The app shell (index.html, the first screens' scripts and styles, the church shell and the
 *   messages of both languages) is precached on install, so the app opens without the
 *   network: on 3G that saves a round trip of half a second or more on every launch.
 * - Fingerprinted files under /assets/ are cache-first: their name changes with their content.
 * - Page navigations are answered with the cached shell; the router takes it from there.
 * - API GETs of this origin go to the network first. The answers of the screens viewed last are
 *   kept for a short offline fallback: only for the signed-in account the page announced, never
 *   for pastoral care, the church register, finance, check-in, security, audit, members,
 *   invitations or exports, nor a person's private details (the fields the server encrypts),
 *   at most MAX_API_ENTRIES of them, for at most a day. Signing out deletes them.
 * - A new version waits until the page asks it to take over ("Versi baru tersedia").
 */

const VERSION = '__TG_VERSION__';
const PRECACHE = __TG_PRECACHE__;

const SHELL_CACHE = `tg-shell-${VERSION}`;
const ASSET_CACHE = 'tg-assets';
const API_CACHE_PREFIX = 'tg-api:';
const MAX_API_ENTRIES = 80;
const MAX_API_AGE_MS = 24 * 60 * 60 * 1000;
const CACHED_AT = 'x-tatagereja-cached-at';
/** Where the announced account is kept: a browser stops an idle worker, and its memory with it. */
const META_CACHE = 'tg-meta';
const ACCOUNT_KEY = '/__tatagereja/account';

/** API reads worth keeping for offline use: the screens people open most. */
const OFFLINE_API =
  /^\/api\/(?:meta|notifications(?:\/.*)?|churches|churches\/[^/]+(?:\/(?:modules|dashboard|directory|people|households|areas|groups|events|calendar|announcements|bulletins|worship|attendance|facilities|inventory)(?:\/.*)?)?)$/;
/** Never stored, even below an allowed path. */
const PRIVATE_API =
  /\/(?:care|records|finance|checkin|security|audit-logs|members|invitations|export|backup|auth)(?:\/|$)|\/export|\.csv$/;

/**
 * The account whose answers may be stored; the page tells it (`account` message). `undefined`
 * until read back from META_CACHE after the worker (re)started.
 */
let account;

async function currentAccount() {
  if (account !== undefined) return account;
  let stored = null;
  try {
    const answer = await (await caches.open(META_CACHE)).match(ACCOUNT_KEY);
    stored = answer ? (await answer.text()) || null : null;
  } catch {
    // Storage unavailable: nothing is stored or served.
  }
  // A message that arrived meanwhile wins.
  if (account === undefined) account = stored;
  return account;
}

async function rememberAccount(id) {
  account = id;
  try {
    const cache = await caches.open(META_CACHE);
    await cache.put(ACCOUNT_KEY, new Response(id ?? ''));
  } catch {
    // Storage unavailable: the account is known until the worker stops.
  }
}

const apiCacheName = (id) => `${API_CACHE_PREFIX}${id}`;

async function deleteApiCaches(except) {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(API_CACHE_PREFIX) && name !== except)
      .map((name) => caches.delete(name)),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' }))),
      ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('tg-shell-') && name !== SHELL_CACHE)
          .map((name) => caches.delete(name)),
      );
      // Fingerprinted files of older versions: keep only what this version precaches or
      // fetched since, so the cache does not grow with every release.
      const assets = await caches.open(ASSET_CACHE);
      const keep = new Set(PRECACHE.map((path) => new URL(path, self.location.origin).href));
      for (const request of await assets.keys()) {
        if (!keep.has(request.url)) await assets.delete(request);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'skip-waiting') {
    void self.skipWaiting();
  } else if (message.type === 'account') {
    const next = typeof message.id === 'string' && message.id ? message.id : null;
    // Only one account's answers ever exist on the device.
    event.waitUntil(
      Promise.all([rememberAccount(next), deleteApiCaches(next ? apiCacheName(next) : undefined)]),
    );
  }
});

async function fromShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  return cache.match(request, { ignoreSearch: true });
}

/** Cache-first for fingerprinted files; never stores the index.html answer of a missing file. */
async function assetResponse(request) {
  const cached = (await fromShell(request)) ?? (await caches.match(request));
  if (cached) return cached;
  const response = await fetch(request);
  const type = response.headers.get('content-type') ?? '';
  if (response.ok && !type.includes('text/html')) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/** Navigations: the cached shell (the router renders the route), the network otherwise. */
async function navigationResponse(request) {
  const shell = await fromShell(new Request('/index.html'));
  if (shell) return shell;
  return fetch(request);
}

async function trimApiCache(cache) {
  const requests = await cache.keys();
  for (const request of requests.slice(0, Math.max(0, requests.length - MAX_API_ENTRIES))) {
    await cache.delete(request);
  }
}

/**
 * A person's private details (national ID, medical and pastoral notes) are encrypted at rest on
 * the server; they never land in a device's storage.
 */
const carriesPrivateDetails = (body) => {
  try {
    const data = JSON.parse(new TextDecoder().decode(body));
    return !!data && typeof data === 'object' && !!data.privateDetails;
  } catch {
    return false;
  }
};

/** Keeps a copy of an answer; a copy that cannot be kept never fails the request. */
async function storeApiResponse(owner, request, response) {
  try {
    const headers = new Headers(response.headers);
    // The body is already decoded, and matching is by URL only (the API answers `Vary: *`).
    headers.delete('content-encoding');
    headers.delete('content-length');
    headers.delete('vary');
    headers.set(CACHED_AT, String(Date.now()));
    const body = await response.arrayBuffer();
    if (carriesPrivateDetails(body) || owner !== account) return;
    const cache = await caches.open(apiCacheName(owner));
    await cache.delete(request);
    await cache.put(request, new Response(body, { status: 200, headers }));
    // Signed out while the copy was written: it goes with the rest.
    if (owner !== account) {
      await caches.delete(apiCacheName(owner));
      return;
    }
    await trimApiCache(cache);
  } catch {
    // Storage full or unavailable: the app works online without copies.
  }
}

/** Network first; the stored answer of the same request only when the network fails. */
async function apiResponse(event, request, url) {
  const owner = await currentAccount();
  const storable =
    owner !== null && OFFLINE_API.test(url.pathname) && !PRIVATE_API.test(url.pathname);
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    if (!storable) throw error;
    const cache = await caches.open(apiCacheName(owner));
    const cached = await cache.match(request, { ignoreVary: true });
    const at = Number(cached?.headers.get(CACHED_AT) ?? 0);
    if (cached && Date.now() - at < MAX_API_AGE_MS) return cached;
    throw error;
  }
  // Not kept when the account changed meanwhile (signed out while it loaded).
  if (storable && owner === account && response.status === 200) {
    event.waitUntil(storeApiResponse(owner, request, response.clone()));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    // Event streams and downloads go straight through.
    if (request.headers.get('accept')?.includes('text/event-stream')) return;
    event.respondWith(apiResponse(event, request, url));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)) {
    event.respondWith(assetResponse(request));
  }
});
