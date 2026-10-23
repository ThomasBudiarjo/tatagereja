import { canManageRecords, canViewRegistry } from '@tatagereja/shared';
import { BookOpenText, Droplets, Flower2, Gem, ScrollText, Settings2 } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

/** Register viewers and managers see the register books. */
const access: AccessRule = { anyOf: ['records.view', 'records.manage'] };
const manage: AccessRule = { check: ({ access }) => canManageRecords(access) };
/** Members without the register see their own records instead. */
const mine: AccessRule = {
  check: ({ access }) => !canViewRegistry(access) && access.personId !== null,
};

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
    {
      path: 'records/register',
      lazy: lazyPage(() => import('./register-page'), 'RegisterPage'),
      handle: { access },
    },
    {
      path: 'records/new',
      lazy: lazyPage(() => import('./record-form-page'), 'NewRecordPage'),
      handle: { access: manage },
    },
    {
      path: 'records/settings',
      lazy: lazyPage(() => import('./records-settings-page'), 'RecordsSettingsPage'),
      handle: { access: { anyOf: ['records.manage', 'settings.manage'] } },
    },
    {
      // Every member: their own records.
      path: 'records/mine',
      lazy: lazyPage(() => import('./my-records-page'), 'MyRecordsPage'),
    },
    {
      // Open to every member: people open their own records; the API decides.
      path: 'records/:recordId',
      lazy: lazyPage(() => import('./record-page'), 'RecordPage'),
    },
    {
      path: 'records/:recordId/certificate',
      lazy: lazyPage(() => import('./certificate-page'), 'CertificatePage'),
    },
    {
      path: 'records/:recordId/correct',
      lazy: lazyPage(() => import('./record-form-page'), 'CorrectRecordPage'),
      handle: { access: manage },
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
      keywords: [
        'baptis',
        'sidi',
        'nikah',
        'pemberkatan',
        'atestasi',
        'penyerahan anak',
        'kedukaan',
        'buku induk',
        'registry',
      ],
    },
    {
      id: 'records-mine',
      to: 'records/mine',
      labelKey: 'records.myTitle',
      descriptionKey: 'records.myDescription',
      icon: ScrollText,
      order: 41,
      access: mine,
      keywords: ['surat baptis', 'sertifikat', 'catatan saya'],
    },
  ],
  quickActions: [
    {
      id: 'new-record',
      to: 'records/new',
      labelKey: 'records.quickNewRecord',
      icon: ScrollText,
      order: 60,
      access: manage,
    },
  ],
  commands: [
    {
      id: 'records-register',
      to: 'records/register',
      labelKey: 'records.registerTitle',
      icon: BookOpenText,
      keywords: ['buku induk', 'register'],
      access,
    },
    {
      id: 'records-new-baptism',
      to: 'records/new?type=baptism',
      labelKey: 'records.newBaptism',
      icon: Droplets,
      keywords: ['baptis', 'baptism'],
      access: manage,
    },
    {
      id: 'records-new-marriage',
      to: 'records/new?type=marriage',
      labelKey: 'records.newMarriage',
      icon: Gem,
      keywords: ['nikah', 'pemberkatan', 'wedding'],
      access: manage,
    },
    {
      id: 'records-new-death',
      to: 'records/new?type=death',
      labelKey: 'records.newDeath',
      icon: Flower2,
      keywords: ['kedukaan', 'meninggal', 'funeral'],
      access: manage,
    },
    {
      id: 'records-settings',
      to: 'records/settings',
      labelKey: 'records.settingsTitle',
      icon: Settings2,
      keywords: ['nomor', 'penomoran', 'numbering'],
      access: { anyOf: ['records.manage', 'settings.manage'] },
    },
  ],
});
