import { ScanLine, School, ShieldCheck, TriangleAlert } from 'lucide-react';
import { ModuleComingSoon, type ModuleHighlight } from '@/components/layout/module-coming-soon';
import { checkinModule } from './module';

const highlights: ModuleHighlight[] = [
  { icon: School, titleKey: 'checkin.planClasses', bodyKey: 'checkin.planClassesBody' },
  { icon: ScanLine, titleKey: 'checkin.planCheckin', bodyKey: 'checkin.planCheckinBody' },
  { icon: ShieldCheck, titleKey: 'checkin.planPickup', bodyKey: 'checkin.planPickupBody' },
  { icon: TriangleAlert, titleKey: 'checkin.planAlerts', bodyKey: 'checkin.planAlertsBody' },
];

export function CheckinHomePage() {
  return <ModuleComingSoon module={checkinModule} highlights={highlights} />;
}
