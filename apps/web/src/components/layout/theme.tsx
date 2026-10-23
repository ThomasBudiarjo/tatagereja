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
      // Both media-specific tags follow the chosen theme, not only the system one.
      for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
        meta.setAttribute('content', dark ? '#1c1815' : '#fbf8f3');
      }
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
          // A thumb-sized action button ("Muat ulang"), not the 24 px default.
          actionButton:
            'h-10! rounded-lg! bg-primary! px-3.5! text-sm! font-semibold! text-primary-foreground!',
        },
      }}
    />
  );
}
