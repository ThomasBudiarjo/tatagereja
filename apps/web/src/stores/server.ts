import type { RegistrationMode } from '@tatagereja/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { normalizeServerUrl } from '@/lib/utils';

export type KnownServer = {
  url: string;
  name: string;
  registrationMode: RegistrationMode;
  turnstileSiteKey: string | null;
  version: string;
  checkedAt: string;
};

export const DEFAULT_SERVER_URL =
  normalizeServerUrl(import.meta.env.VITE_DEFAULT_SERVER_URL || window.location.origin) ??
  window.location.origin;
export const DEFAULT_SERVER_NAME = import.meta.env.VITE_DEFAULT_SERVER_NAME || 'TataGereja Cloud';

type ServerState = {
  currentUrl: string;
  servers: Record<string, KnownServer>;
  selectServer: (server: KnownServer) => void;
  rememberServer: (server: KnownServer) => void;
  forgetServer: (url: string) => void;
  useDefault: () => void;
};

export const useServerStore = create<ServerState>()(
  persist(
    (set) => ({
      currentUrl: DEFAULT_SERVER_URL,
      servers: {},
      selectServer: (server) =>
        set((state) => ({
          currentUrl: server.url,
          servers: { ...state.servers, [server.url]: server },
        })),
      rememberServer: (server) =>
        set((state) => ({ servers: { ...state.servers, [server.url]: server } })),
      forgetServer: (url) =>
        set((state) => {
          const servers = { ...state.servers };
          delete servers[url];
          return {
            servers,
            currentUrl: state.currentUrl === url ? DEFAULT_SERVER_URL : state.currentUrl,
          };
        }),
      useDefault: () => set({ currentUrl: DEFAULT_SERVER_URL }),
    }),
    { name: 'tatagereja.server', version: 1 },
  ),
);

export const currentServerUrl = () => useServerStore.getState().currentUrl;
export const isDefaultServer = (url: string) => url === DEFAULT_SERVER_URL;
