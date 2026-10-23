import { isModuleEnabled, type ModuleId } from '@tatagereja/shared';
import { useMemo } from 'react';
import type { LoaderFunctionArgs, RouteObject } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import type { ModuleTone } from '@/components/ui/tone';
import { churchQuery } from '@/features/churches/api';
import { queryClient } from '@/lib/query-client';
import {
  evaluateAccess,
  MODULE_SECTIONS,
  type CommandEntry,
  type ModuleContext,
  type ModuleManifest,
  type ModuleRouteHandle,
  type ModuleSection,
  type NavItem,
  type QuickAction,
} from '@/lib/modules';
import { adminSecurityModule } from './admin-security/module';
import { careModule } from './care/module';
import { checkinModule } from './checkin/module';
import { commsModule } from './comms/module';
import { coreModule } from './core/module';
import { facilitiesModule } from './facilities/module';
import { financeModule } from './finance/module';
import { insightsModule } from './insights/module';
import { peopleModule } from './people/module';
import { recordsModule } from './records/module';
import { worshipModule } from './worship/module';

/**
 * Every module manifest, already listed: a module only edits its own `module.tsx`. The
 * router, sidebar, bottom tabs, menu page, quick actions and command palette come from here.
 */
export const MODULE_MANIFESTS: readonly ModuleManifest[] = [
  insightsModule,
  peopleModule,
  commsModule,
  worshipModule,
  careModule,
  recordsModule,
  checkinModule,
  financeModule,
  facilitiesModule,
  adminSecurityModule,
  coreModule,
];

export const moduleManifest = (id: ModuleId): ModuleManifest | undefined =>
  MODULE_MANIFESTS.find((manifest) => manifest.id === id);

/**
 * Opening a route with a `prefetch` handle starts its data while the screen's code downloads
 * (the loader returns at once, so navigation never waits on it). Access comes from the church,
 * which every church screen loads anyway.
 */
const prefetchLoader =
  (handle: ModuleRouteHandle & { prefetch: NonNullable<ModuleRouteHandle['prefetch']> }) =>
  ({ params }: LoaderFunctionArgs) => {
    const churchId = params.churchId;
    if (churchId) {
      void queryClient
        .ensureQueryData(churchQuery(churchId))
        .then(({ church, access }) => {
          // Only what the route guard would let the screen show.
          const context: ModuleContext = {
            church,
            access,
            churchId,
            base: `/c/${churchId}`,
            isEnabled: (id: ModuleId) => isModuleEnabled(church.enabledModules, id),
          };
          if (handle.moduleId && !context.isEnabled(handle.moduleId)) return;
          if (!evaluateAccess(handle.access, context)) return;
          return handle.prefetch({ churchId, access, client: queryClient, params });
        })
        .catch(() => undefined);
    }
    return null;
  };

const withModule = (route: RouteObject, moduleId: ModuleId): RouteObject => {
  const handle: ModuleRouteHandle = {
    ...(route.handle as ModuleRouteHandle | undefined),
    moduleId,
  };
  const { prefetch } = handle;
  const loader = prefetch && !route.loader ? prefetchLoader({ ...handle, prefetch }) : route.loader;
  if (route.index) return { ...route, handle, loader } as RouteObject;
  return {
    ...route,
    handle,
    loader,
    children: route.children?.map((child) => withModule(child, moduleId)),
  } as RouteObject;
};

/** Every module route under `/c/:churchId`, tagged with its module for the route guard. */
export const CHURCH_ROUTES: RouteObject[] = MODULE_MANIFESTS.flatMap((manifest) =>
  manifest.routes.map((route) => withModule(route, manifest.id)),
);

/** The context visibility rules are evaluated against, for the current church. */
export function useModuleContext(): ModuleContext {
  const { church, access, churchId, base } = useChurch();
  return useMemo(
    () => ({
      church,
      access,
      churchId,
      base,
      isEnabled: (id: ModuleId) => isModuleEnabled(church.enabledModules, id),
    }),
    [church, access, churchId, base],
  );
}

export type MenuItem = NavItem & {
  moduleId: ModuleId;
  tone: ModuleTone;
  section: ModuleSection;
  /** Absolute path. */
  href: string;
};

export type MenuAction = Pick<QuickAction, 'id' | 'to' | 'labelKey' | 'icon' | 'access'> & {
  keywords?: string[];
  order: number;
  moduleId: ModuleId;
  tone: ModuleTone;
  href: string;
};

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
const hrefFor = (base: string, to: string) => (to ? `${base}/${to}` : base);

/**
 * The menu the caller may see in this church: entries of enabled modules whose access rule
 * holds, grouped by section. Hidden, not disabled: people only see what they can use.
 */
export function useModuleMenu() {
  const context = useModuleContext();
  return useMemo(() => {
    const enabled = MODULE_MANIFESTS.filter((manifest) => context.isEnabled(manifest.id));
    const items: MenuItem[] = enabled
      .flatMap((manifest) =>
        (manifest.nav ?? []).map((item) => ({
          ...item,
          moduleId: manifest.id,
          tone: item.tone ?? manifest.accent,
          section: item.section ?? manifest.section,
          href: hrefFor(context.base, item.to),
        })),
      )
      .filter((item) => evaluateAccess(item.access, context))
      .sort(byOrder);
    const sections = MODULE_SECTIONS.map((section) => ({
      ...section,
      items: items.filter((item) => item.section === section.id),
    })).filter((section) => section.items.length > 0);
    const quickActions: MenuAction[] = enabled
      .flatMap((manifest) =>
        (manifest.quickActions ?? []).map((action) => ({
          ...action,
          moduleId: manifest.id,
          tone: action.tone ?? manifest.accent,
          href: hrefFor(context.base, action.to),
        })),
      )
      .filter((action) => evaluateAccess(action.access, context))
      .sort(byOrder);
    const commands: MenuAction[] = enabled
      .flatMap((manifest) =>
        (manifest.commands ?? []).map((command: CommandEntry) => ({
          ...command,
          order: 0,
          moduleId: manifest.id,
          tone: manifest.accent,
          href: hrefFor(context.base, command.to),
        })),
      )
      .filter((command) => evaluateAccess(command.access, context));
    const tab = (id: NonNullable<NavItem['mobileTab']>) =>
      items.find((item) => item.mobileTab === id);
    const topBar = enabled.flatMap((manifest) => manifest.topBar ?? []);
    return {
      context,
      items,
      sections,
      quickActions,
      commands,
      tabs: { home: tab('home'), people: tab('people'), events: tab('events') },
      topBar,
    };
  }, [context]);
}
