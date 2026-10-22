import { HeartHandshake } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

/** Anyone holding one of the module's permissions sees it. */
const access: AccessRule = {
  anyOf: [
    'prayer.submit',
    'prayer.moderate',
    'care.view',
    'care.manage',
    'care.confidential',
    'diakonia.view',
    'diakonia.manage',
  ],
};

export const careModule = defineModule({
  id: 'care',
  icon: HeartHandshake,
  accent: 'rose',
  labelKey: 'care.nav',
  descriptionKey: 'care.description',
  section: 'ministry',
  routes: [
    {
      path: 'care',
      lazy: lazyPage(() => import('./care-home-page'), 'CareHomePage'),
      handle: { access },
    },
  ],
  nav: [
    {
      id: 'care',
      to: 'care',
      labelKey: 'care.nav',
      descriptionKey: 'care.description',
      icon: HeartHandshake,
      order: 30,
      access,
      keywords: ['pastoral', 'perkunjungan', 'pokok doa', 'prayer', 'diakonia', 'visit'],
    },
  ],
});
