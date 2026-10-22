import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { Loader2, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigation } from 'react-router';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const subscribe = (callback: () => void) => {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
};

const useOnline = () =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

/** True once `active` has stayed true for `delay` ms. */
function useDelayed(active: boolean, delay: number) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setLate(true), delay);
    return () => {
      clearTimeout(timer);
      setLate(false);
    };
  }, [active, delay]);
  return active && late;
}

/**
 * A slim progress bar at the top while a screen or data loads (after a short delay, so fast
 * loads do not flicker), plus a pill when the device is offline, when it comes back online,
 * or when loading takes unusually long.
 */
export function NetworkStatus() {
  const { t } = useI18n();
  const online = useOnline();
  const navigation = useNavigation();
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const busy = navigation.state !== 'idle' || fetching > 0 || mutating > 0;
  const showBar = useDelayed(busy, 250);
  const slow = useDelayed(busy && online, 6000);
  const [wasOffline, setWasOffline] = useState(false);
  const [backOnline, setBackOnline] = useState(false);

  if (!online && !wasOffline) setWasOffline(true);
  if (online && wasOffline) {
    setWasOffline(false);
    setBackOnline(true);
  }
  useEffect(() => {
    if (!backOnline) return;
    const timer = setTimeout(() => setBackOnline(false), 2500);
    return () => clearTimeout(timer);
  }, [backOnline]);

  const pill = !online ? 'offline' : backOnline ? 'online' : slow ? 'slow' : null;

  return (
    <>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity duration-300',
          showBar ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="h-full w-2/5 animate-progress rounded-full bg-primary" />
      </div>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6"
      >
        {pill ? (
          <div
            data-tone={pill === 'offline' ? 'warning' : pill === 'online' ? 'success' : 'neutral'}
            className="flex animate-rise-in items-center gap-2 rounded-full border border-tone/25 bg-popover px-4 py-2 text-sm font-medium shadow-overlay"
          >
            {pill === 'offline' ? (
              <WifiOff className="size-4 text-tone-ink" />
            ) : pill === 'online' ? (
              <Wifi className="size-4 text-tone-ink" />
            ) : (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
            {pill === 'offline'
              ? t('common.offline')
              : pill === 'online'
                ? t('common.backOnline')
                : t('common.slowNetwork')}
          </div>
        ) : null}
      </div>
    </>
  );
}
