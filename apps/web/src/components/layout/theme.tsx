import { useEffect } from 'react';
import { resolveTheme, useUiStore } from '@/stores/ui';

/** Applies the theme preference to the document and follows system changes. */
export function ThemeEffect() {
  const theme = useUiStore((state) => state.theme);
  useEffect(() => {
    const apply = () => {
      document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark');
    };
    apply();
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return null;
}
