import { canManageFacilities } from '@tatagereja/shared';
import {
  Building2,
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  DoorOpen,
  HandHelping,
  Package,
  PackagePlus,
  QrCode,
} from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';
import { pendingBadgeQuery } from './api';

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
/** Rooms, resources and their schedule. */
const view: AccessRule = { anyOf: ['facilities.view', 'facilities.book', 'facilities.manage'] };
const book: AccessRule = { anyOf: ['facilities.book', 'facilities.manage'] };
const manage: AccessRule = { anyOf: ['facilities.manage'] };
const inventory: AccessRule = { anyOf: ['inventory.view', 'inventory.manage'] };
const inventoryManage: AccessRule = { anyOf: ['inventory.manage'] };

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
    {
      path: 'facilities/rooms',
      lazy: lazyPage(() => import('./resources-page'), 'ResourcesPage'),
      handle: { access: view },
    },
    {
      path: 'facilities/rooms/new',
      lazy: lazyPage(() => import('./resource-form-page'), 'NewResourcePage'),
      handle: { access: manage },
    },
    {
      path: 'facilities/rooms/:resourceId',
      lazy: lazyPage(() => import('./resource-page'), 'ResourcePage'),
      handle: { access: view },
    },
    {
      path: 'facilities/rooms/:resourceId/edit',
      lazy: lazyPage(() => import('./resource-form-page'), 'EditResourcePage'),
      handle: { access: manage },
    },
    {
      path: 'facilities/schedule',
      lazy: lazyPage(() => import('./schedule-page'), 'SchedulePage'),
      handle: { access: view },
    },
    {
      path: 'facilities/bookings',
      lazy: lazyPage(() => import('./bookings-page'), 'BookingsPage'),
      handle: { access: view },
    },
    {
      path: 'facilities/bookings/new',
      lazy: lazyPage(() => import('./booking-form-page'), 'NewBookingPage'),
      handle: { access: book },
    },
    {
      path: 'facilities/bookings/:bookingId',
      lazy: lazyPage(() => import('./booking-page'), 'BookingPage'),
      handle: { access: view },
    },
    {
      path: 'facilities/bookings/:bookingId/edit',
      lazy: lazyPage(() => import('./booking-form-page'), 'EditBookingPage'),
      handle: { access: book },
    },
    {
      path: 'facilities/inventory',
      lazy: lazyPage(() => import('./inventory-page'), 'InventoryPage'),
      handle: { access: inventory },
    },
    {
      path: 'facilities/inventory/new',
      lazy: lazyPage(() => import('./asset-form-page'), 'NewAssetPage'),
      handle: { access: inventoryManage },
    },
    {
      path: 'facilities/inventory/labels',
      lazy: lazyPage(() => import('./asset-labels-page'), 'AssetLabelsPage'),
      handle: { access: inventory },
    },
    {
      path: 'facilities/inventory/:assetId',
      lazy: lazyPage(() => import('./asset-page'), 'AssetPage'),
      handle: { access: inventory },
    },
    {
      path: 'facilities/inventory/:assetId/edit',
      lazy: lazyPage(() => import('./asset-form-page'), 'EditAssetPage'),
      handle: { access: inventoryManage },
    },
    {
      path: 'facilities/loans',
      lazy: lazyPage(() => import('./loans-page'), 'LoansPage'),
      handle: { access: inventory },
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
      keywords: ['ruangan', 'sarana', 'inventaris', 'peminjaman', 'booking', 'aula', 'gedung'],
      // Requests waiting for a decision, for those who decide.
      badge: ({ churchId, access: caller }) =>
        canManageFacilities(caller)
          ? pendingBadgeQuery(churchId)
          : {
              queryKey: ['church', churchId, 'facilities', 'bookings', 'badge', 'none'],
              queryFn: () => Promise.resolve(0),
              staleTime: Infinity,
            },
    },
  ],
  quickActions: [
    {
      id: 'book-room',
      to: 'facilities/bookings/new',
      labelKey: 'facilities.quickBook',
      icon: CalendarPlus,
      order: 60,
      access: book,
    },
    {
      id: 'new-asset',
      to: 'facilities/inventory/new',
      labelKey: 'facilities.newAsset',
      icon: PackagePlus,
      order: 61,
      access: inventoryManage,
    },
  ],
  commands: [
    {
      id: 'facilities-rooms',
      to: 'facilities/rooms',
      labelKey: 'facilities.roomsTitle',
      icon: DoorOpen,
      keywords: ['ruangan', 'aula', 'ruang kelas', 'kendaraan', 'rooms', 'resources'],
      access: view,
    },
    {
      id: 'facilities-schedule',
      to: 'facilities/schedule',
      labelKey: 'facilities.scheduleTitle',
      icon: CalendarRange,
      keywords: ['jadwal ruangan', 'kosong', 'tersedia', 'schedule', 'availability'],
      access: view,
    },
    {
      id: 'facilities-bookings',
      to: 'facilities/bookings',
      labelKey: 'facilities.bookingsTitle',
      icon: CalendarClock,
      keywords: ['peminjaman ruangan', 'pengajuan', 'persetujuan', 'bookings', 'approve'],
      access: view,
    },
    {
      id: 'facilities-inventory',
      to: 'facilities/inventory',
      labelKey: 'facilities.inventoryTitle',
      icon: Package,
      keywords: ['inventaris', 'aset', 'barang', 'proyektor', 'sound system', 'assets'],
      access: inventory,
    },
    {
      id: 'facilities-loans',
      to: 'facilities/loans',
      labelKey: 'facilities.loansPageTitle',
      icon: HandHelping,
      keywords: ['pinjam barang', 'terlambat', 'dikembalikan', 'loans', 'overdue'],
      access: inventory,
    },
    {
      id: 'facilities-labels',
      to: 'facilities/inventory/labels',
      labelKey: 'facilities.labelsTitle',
      icon: QrCode,
      keywords: ['label', 'qr', 'stiker', 'cetak'],
      access: inventoryManage,
    },
  ],
});
