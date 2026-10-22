import { LayoutGrid, Settings } from 'lucide-react';
import { defineModule, lazyPage } from '@/lib/modules';

/** The church itself: settings, the menu page and the ministry hub. */
export const coreModule = defineModule({
  id: 'core',
  icon: Settings,
  accent: 'brand',
  labelKey: 'core.settings',
  descriptionKey: 'core.settingsDescription',
  section: 'admin',
  routes: [
    {
      // Every member opens it: the profile, leaving the church, and what their role allows.
      path: 'settings',
      lazy: lazyPage(() => import('@/features/churches/settings-page'), 'ChurchSettingsPage'),
    },
    {
      path: 'more',
      lazy: lazyPage(() => import('./menu-page'), 'MenuPage'),
    },
    {
      path: 'ministry',
      lazy: lazyPage(() => import('./ministry-page'), 'MinistryPage'),
    },
    // The component gallery, for development and visual review only.
    ...(import.meta.env.DEV || import.meta.env.VITE_UI_GALLERY === '1'
      ? [{ path: 'ui', lazy: lazyPage(() => import('./ui-gallery-page'), 'UiGalleryPage') }]
      : []),
  ],
  nav: [
    {
      id: 'settings',
      to: 'settings',
      labelKey: 'core.settings',
      descriptionKey: 'core.settingsDescription',
      icon: Settings,
      order: 90,
      keywords: ['pengaturan', 'anggota', 'undangan', 'modul', 'settings', 'members', 'invite'],
    },
  ],
  commands: [
    {
      id: 'menu',
      to: 'more',
      labelKey: 'common.menu',
      icon: LayoutGrid,
      keywords: ['semua', 'all', 'modules'],
    },
  ],
});
