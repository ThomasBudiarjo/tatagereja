import { ShieldCheck } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

/** Anyone holding one of the module's permissions sees it. */
const access: AccessRule = {
  anyOf: ['security.manage', 'backup.export', 'roles.manage', 'audit.view'],
};

export const adminSecurityModule = defineModule({
  id: 'admin-security',
  icon: ShieldCheck,
  accent: 'slate',
  labelKey: 'admin-security.nav',
  descriptionKey: 'admin-security.description',
  section: 'admin',
  routes: [
    {
      path: 'security',
      lazy: lazyPage(() => import('./security-home-page'), 'SecurityHomePage'),
      handle: { access },
    },
  ],
  nav: [
    {
      id: 'admin-security',
      to: 'security',
      labelKey: 'admin-security.nav',
      descriptionKey: 'admin-security.description',
      icon: ShieldCheck,
      order: 80,
      access,
      keywords: ['keamanan', 'peran', 'hak akses', 'audit', '2fa', 'roles', 'permissions'],
    },
  ],
});
