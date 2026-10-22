import { CalendarClock, DoorOpen, Package, Wrench } from 'lucide-react';
import { ModuleComingSoon, type ModuleHighlight } from '@/components/layout/module-coming-soon';
import { facilitiesModule } from './module';

const highlights: ModuleHighlight[] = [
  { icon: DoorOpen, titleKey: 'facilities.planRooms', bodyKey: 'facilities.planRoomsBody' },
  {
    icon: CalendarClock,
    titleKey: 'facilities.planBookings',
    bodyKey: 'facilities.planBookingsBody',
  },
  { icon: Package, titleKey: 'facilities.planInventory', bodyKey: 'facilities.planInventoryBody' },
  { icon: Wrench, titleKey: 'facilities.planLoans', bodyKey: 'facilities.planLoansBody' },
];

export function FacilitiesHomePage() {
  return <ModuleComingSoon module={facilitiesModule} highlights={highlights} />;
}
