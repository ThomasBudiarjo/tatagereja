import { Wallet } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

/** Anyone holding one of the module's permissions sees it. */
const access: AccessRule = {
  anyOf: ['finance.view', 'finance.record', 'finance.approve', 'finance.manage', 'finance.reports'],
};

export const financeModule = defineModule({
  id: 'finance',
  icon: Wallet,
  accent: 'emerald',
  labelKey: 'finance.nav',
  descriptionKey: 'finance.description',
  section: 'admin',
  routes: [
    {
      path: 'finance',
      lazy: lazyPage(() => import('./finance-home-page'), 'FinanceHomePage'),
      handle: { access },
    },
  ],
  nav: [
    {
      id: 'finance',
      to: 'finance',
      labelKey: 'finance.nav',
      descriptionKey: 'finance.description',
      icon: Wallet,
      order: 10,
      access,
      keywords: ['keuangan', 'persembahan', 'perpuluhan', 'kolekte', 'offering', 'tithe'],
    },
  ],
});
