import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { matchRoutes, type RouteObject } from 'react-router';
import { useModuleMenu } from '@/features/registry';
import type { ModuleRouteHandle } from '@/lib/modules';
import { mayPrefetch, whenQuiet } from '@/lib/prefetch';
import { useChurch } from './church-provider';

type Preloadable = { preload?: () => Promise<unknown> };

/** A mouse resting this long on a link means it is likely to be clicked. */
const HOVER_INTENT_MS = 80;

/**
 * Fetches a screen before it is opened: its code (every lazy route) and, when its route has a
 * `prefetch` handle, the data it opens with. A touch on a phone starts about 100 ms before
 * the tap ends; a mouse rests on a link longer. Once the first church screen has its data,
 * the code of the bottom tabs comes in idle time, so switching tabs never waits on 3G.
 * Nothing is fetched speculatively with Data Saver on.
 */
export function LinkPrefetch({ routes }: { routes: RouteObject[] }) {
  const { churchId, access } = useChurch();
  const client = useQueryClient();
  const { tabs } = useModuleMenu();

  useEffect(() => {
    if (!mayPrefetch()) return;
    const tree: RouteObject[] = [{ path: '/c/:churchId', children: routes }];
    const warm = (path: string, withData: boolean) => {
      for (const { route, params } of matchRoutes(tree, path) ?? []) {
        const preload = (route.lazy as Preloadable | undefined)?.preload;
        if (preload) void preload().catch(() => undefined);
        const prefetch = (route.handle as ModuleRouteHandle | undefined)?.prefetch;
        if (withData && prefetch && params.churchId === churchId) {
          void Promise.resolve(prefetch({ churchId, access, client, params })).catch(
            () => undefined,
          );
        }
      }
    };
    const linkOf = (target: EventTarget | null) => {
      const anchor = target instanceof Element ? target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return null;
      if (anchor.origin !== window.location.origin || anchor.target === '_blank') return null;
      if (anchor.pathname === window.location.pathname) return null;
      return anchor;
    };

    let hovered: HTMLAnchorElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const anchor = linkOf(event.target);
      if (anchor === hovered) return;
      hovered = anchor;
      clearTimeout(timer);
      if (anchor) timer = setTimeout(() => warm(anchor.pathname, true), HOVER_INTENT_MS);
    };
    const onIntent = (event: Event) => {
      const anchor = linkOf(event.target);
      if (anchor) warm(anchor.pathname, true);
    };
    document.addEventListener('pointerover', onPointerOver, { passive: true });
    document.addEventListener('touchstart', onIntent, { passive: true, capture: true });
    document.addEventListener('focusin', onIntent);

    let active = true;
    whenQuiet(() => {
      if (!active) return;
      for (const tab of [tabs.home, tabs.people, tabs.events]) {
        if (tab) warm(tab.href, false);
      }
    });

    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('touchstart', onIntent, { capture: true });
      document.removeEventListener('focusin', onIntent);
    };
  }, [routes, churchId, access, client, tabs]);

  return null;
}
