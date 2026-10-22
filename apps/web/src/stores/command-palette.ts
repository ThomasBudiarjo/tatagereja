import { create } from 'zustand';

type CommandPaletteState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

/** Whether the command palette (Ctrl/⌘ K) is open; any search button can open it. */
export const useCommandPalette = create<CommandPaletteState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
