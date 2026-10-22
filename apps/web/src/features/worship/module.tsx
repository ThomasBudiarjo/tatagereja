import { Music } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

/** Anyone holding one of the module's permissions sees it. */
const access: AccessRule = { anyOf: ['services.view', 'services.manage', 'volunteers.schedule'] };

export const worshipModule = defineModule({
  id: 'worship',
  icon: Music,
  accent: 'violet',
  labelKey: 'worship.nav',
  descriptionKey: 'worship.description',
  section: 'ministry',
  routes: [
    {
      path: 'worship',
      lazy: lazyPage(() => import('./worship-home-page'), 'WorshipHomePage'),
      handle: { access },
    },
  ],
  nav: [
    {
      id: 'worship',
      to: 'worship',
      labelKey: 'worship.nav',
      descriptionKey: 'worship.description',
      icon: Music,
      order: 20,
      access,
      keywords: ['ibadah', 'liturgi', 'jadwal pelayanan', 'lagu', 'kidung', 'roster'],
    },
  ],
});
