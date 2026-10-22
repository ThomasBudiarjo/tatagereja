import { Building2 } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

/** Anyone holding one of the module's permissions sees it. */
const access: AccessRule = {
  anyOf: [
    'facilities.view',
    'facilities.book',
    'facilities.manage',
    'inventory.view',
    'inventory.manage',
  ],
};

export const facilitiesModule = defineModule({
  id: 'facilities',
  icon: Building2,
  accent: 'olive',
  labelKey: 'facilities.nav',
  descriptionKey: 'facilities.description',
  section: 'admin',
  routes: [
    {
      path: 'facilities',
      lazy: lazyPage(() => import('./facilities-home-page'), 'FacilitiesHomePage'),
      handle: { access },
    },
  ],
  nav: [
    {
      id: 'facilities',
      to: 'facilities',
      labelKey: 'facilities.nav',
      descriptionKey: 'facilities.description',
      icon: Building2,
      order: 20,
      access,
      keywords: ['ruangan', 'sarana', 'inventaris', 'peminjaman', 'booking'],
    },
  ],
});
