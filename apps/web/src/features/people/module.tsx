import { can } from '@tatagereja/shared';
import { UserPlus, Users, UsersRound } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

const viewPeople: AccessRule = { anyOf: ['people.view'] };
const viewGroups: AccessRule = { anyOf: ['groups.view'] };
const createPerson: AccessRule = { check: ({ access }) => can.createPerson(access) };

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
      handle: { access: viewPeople },
    },
    {
      path: 'people/new',
      lazy: lazyPage(() => import('./new-person-page'), 'NewPersonPage'),
      handle: { access: createPerson },
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
      path: 'groups',
      lazy: lazyPage(() => import('@/features/groups/groups-page'), 'GroupsPage'),
      handle: { access: viewGroups },
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
      id: 'groups',
      to: 'groups',
      labelKey: 'people.groups',
      descriptionKey: 'people.groupsDescription',
      icon: UsersRound,
      section: 'ministry',
      order: 10,
      access: viewGroups,
      keywords: ['komisi', 'kelompok', 'persekutuan', 'ministries', 'groups'],
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
  ],
});
