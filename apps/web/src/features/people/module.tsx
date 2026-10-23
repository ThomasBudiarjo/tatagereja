import { can, has } from '@tatagereja/shared';
import {
  Copy,
  Home,
  Map as MapIcon,
  Tags,
  Upload,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { defineModule, lazyPage, type AccessRule, type RoutePrefetch } from '@/lib/modules';
import { pendingJoinRequestsBadge } from './api';

const viewPeople: AccessRule = { anyOf: ['people.view'] };
const viewGroups: AccessRule = { anyOf: ['groups.view'] };
const createPerson: AccessRule = { check: ({ access }) => can.createPerson(access) };
const mergePeople: AccessRule = { check: ({ access }) => can.mergePeople(access) };
const manageFields: AccessRule = { check: ({ access }) => can.manageCustomFields(access) };
const createGroup: AccessRule = { check: ({ access }) => can.createGroup(access) };
const manageHouseholds: AccessRule = { check: ({ access }) => can.manageHouseholds(access) };
const manageAreas: AccessRule = { check: ({ access }) => can.manageAreas(access) };
/** The directory as it opens: the people page's default list, its counts and filters. */
const prefetchDirectory: RoutePrefetch = async ({ churchId, access: caller, client }) => {
  const [api, groups] = await Promise.all([import('./api'), import('@/features/groups/api')]);
  void client.prefetchQuery(
    api.peopleListQuery(churchId, { sort: 'name', order: 'asc', page: 1, limit: 50 }),
  );
  void client.prefetchQuery(api.peopleSummaryQuery(churchId));
  void client.prefetchQuery(api.areasQuery(churchId));
  void client.prefetchQuery(api.tagsQuery(churchId));
  void client.prefetchQuery(api.fieldsQuery(churchId));
  if (has(caller, 'groups.view')) void client.prefetchQuery(groups.groupsQuery(churchId));
};

/** Leaders and people with `groups.manage` decide on join requests. */
const decideRequests: AccessRule = {
  check: ({ access }) => has(access, 'groups.manage') || access.leaderGroupIds.length > 0,
};

export const peopleModule = defineModule({
  id: 'people',
  icon: Users,
  accent: 'sky',
  labelKey: 'people.nav',
  descriptionKey: 'people.navDescription',
  section: 'main',
  routes: [
    {
      path: 'people',
      lazy: lazyPage(() => import('./people-page'), 'PeoplePage'),
      handle: { access: viewPeople, prefetch: prefetchDirectory },
    },
    {
      path: 'people/new',
      lazy: lazyPage(() => import('./new-person-page'), 'NewPersonPage'),
      handle: { access: createPerson },
    },
    {
      path: 'people/import',
      lazy: lazyPage(() => import('./import-page'), 'ImportPeoplePage'),
      handle: { access: createPerson },
    },
    {
      path: 'people/duplicates',
      lazy: lazyPage(() => import('./duplicates-page'), 'DuplicatesPage'),
      handle: { access: mergePeople },
    },
    {
      path: 'people/fields',
      lazy: lazyPage(() => import('./fields-page'), 'FieldsPage'),
      handle: { access: manageFields },
    },
    {
      // Members always open their own profile; the API decides what else they may see.
      path: 'people/:id',
      lazy: lazyPage(() => import('./person-page'), 'PersonPage'),
    },
    {
      path: 'people/:id/edit',
      lazy: lazyPage(() => import('./edit-person-page'), 'EditPersonPage'),
    },
    {
      path: 'households',
      lazy: lazyPage(() => import('@/features/households/households-page'), 'HouseholdsPage'),
      handle: { access: viewPeople },
    },
    {
      path: 'households/:id',
      lazy: lazyPage(() => import('@/features/households/household-page'), 'HouseholdPage'),
      handle: { access: viewPeople },
    },
    {
      path: 'areas',
      lazy: lazyPage(() => import('@/features/areas/areas-page'), 'AreasPage'),
      handle: { access: viewPeople },
    },
    {
      path: 'areas/:id',
      lazy: lazyPage(() => import('@/features/areas/area-page'), 'AreaPage'),
      handle: { access: viewPeople },
    },
    {
      path: 'groups',
      lazy: lazyPage(() => import('@/features/groups/groups-page'), 'GroupsPage'),
      handle: { access: viewGroups },
    },
    {
      path: 'groups/requests',
      lazy: lazyPage(() => import('@/features/groups/requests-page'), 'JoinRequestsPage'),
      handle: { access: decideRequests },
    },
    {
      path: 'groups/:id',
      lazy: lazyPage(() => import('@/features/groups/group-page'), 'GroupPage'),
      handle: { access: viewGroups },
    },
  ],
  nav: [
    {
      id: 'people',
      to: 'people',
      labelKey: 'people.nav',
      descriptionKey: 'people.navDescription',
      icon: Users,
      order: 10,
      access: viewPeople,
      mobileTab: 'people',
      keywords: ['jemaat', 'anggota', 'direktori', 'members', 'directory'],
    },
    {
      id: 'households',
      to: 'households',
      labelKey: 'people.householdsTitle',
      descriptionKey: 'people.householdsDescription',
      icon: Home,
      tone: 'amber',
      order: 11,
      access: viewPeople,
      keywords: ['keluarga', 'kk', 'kepala keluarga', 'family', 'households'],
    },
    {
      id: 'areas',
      to: 'areas',
      labelKey: 'people.areasTitle',
      descriptionKey: 'people.areasDescription',
      icon: MapIcon,
      tone: 'emerald',
      order: 12,
      access: viewPeople,
      keywords: ['wilayah', 'sektor', 'rayon', 'lingkungan', 'areas', 'districts'],
    },
    {
      id: 'groups',
      to: 'groups',
      labelKey: 'people.groups',
      descriptionKey: 'people.groupsDescription',
      icon: UsersRound,
      tone: 'violet',
      section: 'ministry',
      order: 10,
      access: viewGroups,
      keywords: ['komisi', 'kelompok', 'persekutuan', 'paduan suara', 'ministries', 'groups'],
      badge: ({ churchId }) => pendingJoinRequestsBadge(churchId),
    },
  ],
  quickActions: [
    {
      id: 'add-person',
      to: 'people/new',
      labelKey: 'people.addPerson',
      icon: UserPlus,
      order: 30,
      access: createPerson,
    },
  ],
  commands: [
    {
      id: 'add-person',
      to: 'people/new',
      labelKey: 'people.addPerson',
      icon: UserPlus,
      keywords: ['tambah', 'baru', 'new', 'add'],
      access: createPerson,
    },
    {
      id: 'import-people',
      to: 'people/import',
      labelKey: 'people.importTitle',
      icon: Upload,
      keywords: ['impor', 'csv', 'excel', 'import'],
      access: createPerson,
    },
    {
      id: 'duplicates',
      to: 'people/duplicates',
      labelKey: 'people.duplicatesTitle',
      icon: Copy,
      keywords: ['ganda', 'duplikat', 'gabung', 'merge', 'duplicates'],
      access: mergePeople,
    },
    {
      id: 'fields',
      to: 'people/fields',
      labelKey: 'people.fieldsTitle',
      icon: Tags,
      keywords: ['label', 'kolom', 'tag', 'field'],
      access: manageFields,
    },
    {
      id: 'new-household',
      to: 'households',
      labelKey: 'people.newHousehold',
      icon: Home,
      keywords: ['keluarga baru', 'household'],
      access: manageHouseholds,
    },
    {
      id: 'new-area',
      to: 'areas',
      labelKey: 'people.newArea',
      icon: MapIcon,
      keywords: ['wilayah baru', 'sektor', 'area'],
      access: manageAreas,
    },
    {
      id: 'new-group',
      to: 'groups',
      labelKey: 'groups.new',
      icon: UsersRound,
      keywords: ['kelompok baru', 'komisi', 'group'],
      access: createGroup,
    },
  ],
});
