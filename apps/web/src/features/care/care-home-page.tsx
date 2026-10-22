import { Gift, HandHeart, House, Sparkles, UserPlus } from 'lucide-react';
import { ModuleComingSoon, type ModuleHighlight } from '@/components/layout/module-coming-soon';
import { careModule } from './module';

const highlights: ModuleHighlight[] = [
  { icon: HandHeart, titleKey: 'care.planCases', bodyKey: 'care.planCasesBody' },
  { icon: House, titleKey: 'care.planVisits', bodyKey: 'care.planVisitsBody' },
  { icon: Sparkles, titleKey: 'care.planPrayer', bodyKey: 'care.planPrayerBody' },
  { icon: UserPlus, titleKey: 'care.planFollowUp', bodyKey: 'care.planFollowUpBody' },
  { icon: Gift, titleKey: 'care.planDiakonia', bodyKey: 'care.planDiakoniaBody' },
];

export function CareHomePage() {
  return <ModuleComingSoon module={careModule} highlights={highlights} />;
}
