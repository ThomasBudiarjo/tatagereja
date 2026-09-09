import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

type UiState = {
  theme: ThemePreference;
  lastChurchId: string | null;
  setTheme: (theme: ThemePreference) => void;
  setLastChurchId: (id: string | null) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      lastChurchId: null,
      setTheme: (theme) => set({ theme }),
      setLastChurchId: (lastChurchId) => set({ lastChurchId }),
    }),
    { name: 'tatagereja.ui', version: 1 },
  ),
);

export const resolveTheme = (preference: ThemePreference): 'light' | 'dark' => {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};
