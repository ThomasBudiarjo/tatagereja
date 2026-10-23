import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { Access, Church, ModuleId, Permission } from '@tatagereja/shared';
import { hasAll, hasAny } from '@tatagereja/shared';
import type { ComponentType } from 'react';
import type { Params, RouteObject } from 'react-router';
import type { ModuleTone } from '@/components/ui/tone';
import { loadDictionaries, type MessageKey } from '@/lib/i18n';

/*
 * The module registry contract. Each module describes itself in
 * `features/<moduleId>/module.tsx` with `defineModule`; `features/registry.ts` lists every
 * module, and the router, sidebar, bottom tabs, menu page, home quick actions and command
 * palette are generated from it. A module only edits its own `module.tsx`.
 */

export type ModuleSection = 'main' | 'ministry' | 'admin';

export const MODULE_SECTIONS: readonly { id: ModuleSection; labelKey: MessageKey }[] = [
  { id: 'main', labelKey: 'common.navMain' },
  { id: 'ministry', labelKey: 'common.navMinistry' },
  { id: 'admin', labelKey: 'common.navAdmin' },
];

/** What visibility rules can look at. */
export type ModuleContext = {
  church: Church;
  access: Access;
  churchId: string;
  /** `/c/<churchId>` */
  base: string;
  /** Required modules are always enabled; optional ones per church. */
  isEnabled: (id: ModuleId) => boolean;
};

/**
 * Who sees a menu entry or may open a route. Every listed condition must hold. The API still
 * checks every request; this only keeps people away from screens they cannot use.
 */
export type AccessRule = {
  /** At least one of these permissions. */
  anyOf?: readonly Permission[];
  /** Every one of these permissions. */
  allOf?: readonly Permission[];
  /** A rule built from the shared `can.*` functions (leader scope, own data). */
  check?: (context: ModuleContext) => boolean;
};

export const evaluateAccess = (rule: AccessRule | undefined, context: ModuleContext): boolean => {
  if (!rule) return true;
  if (rule.anyOf && rule.anyOf.length > 0 && !hasAny(context.access, rule.anyOf)) return false;
  if (rule.allOf && !hasAll(context.access, rule.allOf)) return false;
  if (rule.check && !rule.check(context)) return false;
  return true;
};

/** A count shown next to a menu entry (pending approvals, unread items). */
export type BadgeQuery = (context: ModuleContext) => {
  queryKey: QueryKey;
  queryFn: () => Promise<number>;
  refetchInterval?: number;
  staleTime?: number;
};

export type MobileTab = 'home' | 'people' | 'events';

export type NavItem = {
  id: string;
  /** Path below the church, without a leading slash; '' is the church home. */
  to: string;
  labelKey: MessageKey;
  descriptionKey?: MessageKey;
  icon: ComponentType<{ className?: string }>;
  /** Defaults to the module accent. */
  tone?: ModuleTone;
  /** Defaults to the module section. */
  section?: ModuleSection;
  /** Position inside its section (lower first). */
  order: number;
  /** Active only on an exact match (the home entry). */
  end?: boolean;
  access?: AccessRule;
  badge?: BadgeQuery;
  /** Puts the entry in a phone bottom-bar slot. */
  mobileTab?: MobileTab;
  /** Extra words the command palette matches. */
  keywords?: string[];
};

/** A shortcut on the home page ("New event", "Take attendance"). */
export type QuickAction = {
  id: string;
  to: string;
  labelKey: MessageKey;
  icon: ComponentType<{ className?: string }>;
  tone?: ModuleTone;
  order: number;
  access?: AccessRule;
};

/** An extra command palette entry; every menu entry is already one. */
export type CommandEntry = {
  id: string;
  to: string;
  labelKey: MessageKey;
  icon: ComponentType<{ className?: string }>;
  keywords?: string[];
  access?: AccessRule;
};

/** `handle` of a module route; the registry fills in `moduleId`. */
export type ModuleRouteHandle = {
  moduleId?: ModuleId;
  access?: AccessRule;
  /**
   * Warms the data the screen opens with, when a link to it is touched, hovered or focused
   * (the code is fetched for every route). Import query factories inside it (`import('./api')`)
   * so the registry stays small; check `access` like the screen does, never fetch what it
   * would not show.
   */
  prefetch?: RoutePrefetch;
};

export type RoutePrefetch = (context: {
  churchId: string;
  access: Access;
  client: QueryClient;
  params: Params;
}) => unknown;

export type ModuleManifest = {
  id: ModuleId;
  icon: ComponentType<{ className?: string }>;
  accent: ModuleTone;
  labelKey: MessageKey;
  descriptionKey?: MessageKey;
  section: ModuleSection;
  /**
   * Routes under `/c/:churchId`, with relative paths. Load screens with `lazyPage` and guard
   * them with `handle: { access }`; the shell shows a friendly "no access" or "module
   * switched off" state instead of the page when the rule fails.
   */
  routes: RouteObject[];
  nav?: NavItem[];
  quickActions?: QuickAction[];
  commands?: CommandEntry[];
  /** Small components for the top bar (the notifications bell). */
  topBar?: ComponentType[];
};

export const defineModule = (manifest: ModuleManifest): ModuleManifest => manifest;

/**
 * Loads a named page component on demand, so the first paint stays small on phones, together
 * with the dictionaries of every feature (one chunk, fetched once in parallel with the page).
 */
export const lazyPage = <T extends string>(
  loader: () => Promise<Record<T, ComponentType>>,
  name: T,
) =>
  Object.assign(
    async () => {
      const [page] = await Promise.all([loader(), loadDictionaries()]);
      return { Component: page[name] };
    },
    /** Downloads the page without opening it (link prefetching). */
    { preload: loader },
  );
