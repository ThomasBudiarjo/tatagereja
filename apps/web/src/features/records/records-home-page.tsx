import { ArrowLeftRight, Baby, BookCheck, Droplets, Gem, Stamp } from 'lucide-react';
import { ModuleComingSoon, type ModuleHighlight } from '@/components/layout/module-coming-soon';
import { recordsModule } from './module';

const highlights: ModuleHighlight[] = [
  { icon: Droplets, titleKey: 'records.planBaptism', bodyKey: 'records.planBaptismBody' },
  { icon: BookCheck, titleKey: 'records.planSidi', bodyKey: 'records.planSidiBody' },
  { icon: Gem, titleKey: 'records.planMarriage', bodyKey: 'records.planMarriageBody' },
  { icon: Baby, titleKey: 'records.planDedication', bodyKey: 'records.planDedicationBody' },
  { icon: ArrowLeftRight, titleKey: 'records.planTransfer', bodyKey: 'records.planTransferBody' },
  { icon: Stamp, titleKey: 'records.planCertificates', bodyKey: 'records.planCertificatesBody' },
];

export function RecordsHomePage() {
  return <ModuleComingSoon module={recordsModule} highlights={highlights} />;
}
