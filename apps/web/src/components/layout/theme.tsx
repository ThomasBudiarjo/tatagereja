import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { resolveTheme, useUiStore } from '@/stores/ui';

/** Applies the theme preference to the document and follows system changes. */
export function ThemeEffect() {
  const theme = useUiStore((state) => state.theme);
  useEffect(() => {
    const apply = () => {
      const dark = resolveTheme(theme) === 'dark';
      document.documentElement.classList.toggle('dark', dark);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#1c1815' : '#fbf8f3');
    };
    apply();
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return null;
}

/** Toasts in the app theme, above the phone tab bar. */
export function AppToaster() {
  const theme = useUiStore((state) => state.theme);
  return (
    <Toaster
      theme={theme}
      position="top-center"
      richColors
      closeButton
      offset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: 'rounded-xl! font-sans! shadow-overlay! border-border!',
          title: 'font-semibold!',
        },
      }}
    />
  );
}
