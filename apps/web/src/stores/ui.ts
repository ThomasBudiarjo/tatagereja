import type { Locale } from '@tatagereja/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

type UiState = {
  theme: ThemePreference;
  /** Interface language; null follows the browser (Indonesian unless it asks for English). */
  locale: Locale | null;
  lastChurchId: string | null;
  sidebarCollapsed: boolean;
  /** Sidebar sections the person folded away, by section id. */
  collapsedSections: string[];
  setTheme: (theme: ThemePreference) => void;
  setLocale: (locale: Locale | null) => void;
  setLastChurchId: (id: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSection: (section: string) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      locale: null,
      lastChurchId: null,
      sidebarCollapsed: false,
      collapsedSections: [],
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      setLastChurchId: (lastChurchId) => set({ lastChurchId }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSection: (section) =>
        set((state) => ({
          collapsedSections: state.collapsedSections.includes(section)
            ? state.collapsedSections.filter((value) => value !== section)
            : [...state.collapsedSections, section],
        })),
    }),
    { name: 'tatagereja.ui', version: 1 },
  ),
);

export const resolveTheme = (preference: ThemePreference): 'light' | 'dark' => {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};
