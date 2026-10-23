import type { AuthResponse, SessionTransport, User } from '@tatagereja/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useServerStore } from './server';

/*
 * Sessions, one per server. How the credential is held depends on where the server is:
 *
 *  - The server this app is served from uses a `cookie` session: the token lives in an httpOnly
 *    cookie JavaScript never sees. Only the CSRF token is kept, in memory.
 *  - Any other server uses a `bearer` session: a short-lived access token kept in memory only,
 *    and a refresh token (persisted, so a reload stays signed in) that the server rotates on
 *    every use and that ends the whole session if a copy is ever used twice.
 *
 * What is persisted holds no usable credential for cookie sessions, and for bearer sessions
 * only the single-use refresh token. See docs/SECURITY.md.
 */

export type StoredSession = {
  transport: SessionTransport;
  user: User;
  /** Absolute end of the session. */
  sessionExpiresAt: string;
  /** Bearer sessions only. */
  refreshToken: string | null;
};

type AuthState = {
  /** Sessions are stored separately for each server. */
  sessions: Record<string, StoredSession>;
  setSession: (serverUrl: string, session: StoredSession) => void;
  setUser: (serverUrl: string, user: User) => void;
  clearSession: (serverUrl: string) => void;
};

export const AUTH_STORAGE_KEY = 'tatagereja.auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      sessions: {},
      setSession: (serverUrl, session) =>
        set((state) => ({ sessions: { ...state.sessions, [serverUrl]: session } })),
      setUser: (serverUrl, user) =>
        set((state) => {
          const existing = state.sessions[serverUrl];
          if (!existing) return state;
          return { sessions: { ...state.sessions, [serverUrl]: { ...existing, user } } };
        }),
      clearSession: (serverUrl) =>
        set((state) => {
          const sessions = { ...state.sessions };
          delete sessions[serverUrl];
          return { sessions };
        }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      // Version 1 kept long-lived bearer tokens in storage; those sessions were retired.
      version: 2,
      migrate: () => ({ sessions: {} }),
    },
  ),
);

/** The server this page is served from: its sessions use the httpOnly cookie. */
export const transportFor = (serverUrl: string): SessionTransport =>
  serverUrl === window.location.origin ? 'cookie' : 'bearer';

/** Credentials that never touch storage: the access token and the CSRF token. */
type MemoryCredentials = { accessToken?: string; accessExpiresAt?: number; csrfToken?: string };
const memory = new Map<string, MemoryCredentials>();

export const memoryCredentials = (serverUrl: string): MemoryCredentials =>
  memory.get(serverUrl) ?? {};

export const setMemoryCredentials = (serverUrl: string, credentials: MemoryCredentials) =>
  memory.set(serverUrl, { ...memoryCredentials(serverUrl), ...credentials });

const isExpired = (session: StoredSession | undefined): boolean =>
  !session || new Date(session.sessionExpiresAt).getTime() <= Date.now();

/** The stored session of a server, unless it has ended. */
export const sessionOf = (serverUrl: string): StoredSession | undefined => {
  const session = useAuthStore.getState().sessions[serverUrl];
  return isExpired(session) ? undefined : session;
};

const credentialsOf = (response: AuthResponse): MemoryCredentials => ({
  accessToken: response.token ?? undefined,
  accessExpiresAt: response.token ? new Date(response.expiresAt).getTime() : undefined,
  csrfToken: response.csrfToken ?? undefined,
});

/** Keeps a new or rotated session: persisted parts in the store, credentials in memory. */
export function storeSession(serverUrl: string, response: AuthResponse) {
  useAuthStore.getState().setSession(serverUrl, {
    transport: response.transport,
    user: response.user,
    sessionExpiresAt: response.sessionExpiresAt,
    refreshToken: response.refreshToken,
  });
  memory.set(serverUrl, credentialsOf(response));
  broadcast({ type: 'session', serverUrl, response });
}

const signOutListeners = new Set<() => void>();

/** Runs `listener` whenever the current session ends locally (e.g. to drop cached data). */
export const onSignOut = (listener: () => void) => {
  signOutListeners.add(listener);
  return () => {
    signOutListeners.delete(listener);
  };
};

/**
 * Forgets a server's session: the persisted part, the credentials in memory and, through the
 * listeners, everything cached for that account. Other tabs follow.
 */
export const forgetSession = (serverUrl: string, notifyTabs = true) => {
  memory.delete(serverUrl);
  const had = !!useAuthStore.getState().sessions[serverUrl];
  useAuthStore.getState().clearSession(serverUrl);
  if (notifyTabs) broadcast({ type: 'signed-out', serverUrl });
  if (had) for (const listener of signOutListeners) listener();
};

/**
 * Forgets the current server's session after the server ended it (expired, revoked from
 * another device, password changed).
 */
export const signOutLocally = () => forgetSession(useServerStore.getState().currentUrl);

/*
 * Tabs share the persisted session but not memory. A tab that refreshes or rotates the session
 * tells the others the new credentials, so they do not present a token the server already
 * rotated away; signing out in one tab signs out all of them.
 */
type TabMessage =
  | { type: 'session'; serverUrl: string; response: AuthResponse }
  | { type: 'signed-out'; serverUrl: string };

const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('tatagereja.auth');

function broadcast(message: TabMessage) {
  try {
    channel?.postMessage(message);
  } catch {
    // Other tabs keep their own credentials and renew them when needed.
  }
}

channel?.addEventListener('message', (event: MessageEvent<TabMessage>) => {
  const message = event.data;
  if (message.type === 'signed-out') {
    forgetSession(message.serverUrl, false);
    return;
  }
  memory.set(message.serverUrl, credentialsOf(message.response));
  void useAuthStore.persist.rehydrate();
});

/** Reactive view of the current server's session. */
export function useAuth() {
  const serverUrl = useServerStore((state) => state.currentUrl);
  const session = useAuthStore((state) => state.sessions[serverUrl]);
  const valid = !isExpired(session);
  return {
    serverUrl,
    transport: valid ? session?.transport : undefined,
    user: valid ? (session?.user ?? null) : null,
    isAuthenticated: valid && !!session,
  };
}
