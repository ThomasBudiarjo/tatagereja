import type { User } from '@tatagereja/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useServerStore } from './server';

export type StoredSession = { token: string; expiresAt: string; user: User };

type AuthState = {
  /** Sessions are stored separately for each server. */
  sessions: Record<string, StoredSession>;
  setSession: (serverUrl: string, session: StoredSession) => void;
  setUser: (serverUrl: string, user: User) => void;
  clearSession: (serverUrl: string) => void;
};

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
    { name: 'tatagereja.auth', version: 1 },
  ),
);

const isExpired = (session: StoredSession | undefined): boolean =>
  !session || new Date(session.expiresAt).getTime() <= Date.now();

/** Token for the currently selected server (undefined when signed out or expired). */
export const currentToken = (): string | undefined => {
  const serverUrl = useServerStore.getState().currentUrl;
  const session = useAuthStore.getState().sessions[serverUrl];
  return isExpired(session) ? undefined : session?.token;
};

const signOutListeners = new Set<() => void>();

/** Runs `listener` whenever the current session ends locally (e.g. to drop cached data). */
export const onSignOut = (listener: () => void) => {
  signOutListeners.add(listener);
  return () => {
    signOutListeners.delete(listener);
  };
};

/**
 * Forgets the current server's session after the server ended it (expired, revoked from
 * another device, password changed). Listeners drop everything cached for that account.
 */
export const signOutLocally = () => {
  const serverUrl = useServerStore.getState().currentUrl;
  if (!useAuthStore.getState().sessions[serverUrl]) return;
  useAuthStore.getState().clearSession(serverUrl);
  for (const listener of signOutListeners) listener();
};

/** Reactive view of the current server's session. */
export function useAuth() {
  const serverUrl = useServerStore((state) => state.currentUrl);
  const session = useAuthStore((state) => state.sessions[serverUrl]);
  const valid = !isExpired(session);
  return {
    serverUrl,
    token: valid ? session?.token : undefined,
    user: valid ? (session?.user ?? null) : null,
    isAuthenticated: valid && !!session,
  };
}
