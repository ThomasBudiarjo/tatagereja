import { Baby } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

/** Anyone holding one of the module's permissions sees it. */
const access: AccessRule = { anyOf: ['checkin.operate', 'checkin.manage'] };

export const checkinModule = defineModule({
  id: 'checkin',
  icon: Baby,
  accent: 'sun',
  labelKey: 'checkin.nav',
  descriptionKey: 'checkin.description',
  section: 'ministry',
  routes: [
    {
      path: 'checkin',
      lazy: lazyPage(() => import('./checkin-home-page'), 'CheckinHomePage'),
      handle: { access },
    },
  ],
  nav: [
    {
      id: 'checkin',
      to: 'checkin',
      labelKey: 'checkin.nav',
      descriptionKey: 'checkin.description',
      icon: Baby,
      order: 50,
      access,
      keywords: ['sekolah minggu', 'anak', 'kids', 'check-in', 'jemput'],
    },
  ],
});
