import { ScrollText } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

/** Anyone holding one of the module's permissions sees it. */
const access: AccessRule = { anyOf: ['records.view', 'records.manage'] };

export const recordsModule = defineModule({
  id: 'records',
  icon: ScrollText,
  accent: 'indigo',
  labelKey: 'records.nav',
  descriptionKey: 'records.description',
  section: 'ministry',
  routes: [
    {
      path: 'records',
      lazy: lazyPage(() => import('./records-home-page'), 'RecordsHomePage'),
      handle: { access },
    },
  ],
  nav: [
    {
      id: 'records',
      to: 'records',
      labelKey: 'records.nav',
      descriptionKey: 'records.description',
      icon: ScrollText,
      order: 40,
      access,
      keywords: ['baptis', 'sidi', 'nikah', 'atestasi', 'penyerahan anak', 'registry'],
    },
  ],
});
