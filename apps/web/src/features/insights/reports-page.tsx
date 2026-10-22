import { BellRing, ChartLine, Download, MapPinned, Sprout } from 'lucide-react';
import { ModuleComingSoon, type ModuleHighlight } from '@/components/layout/module-coming-soon';
import { insightsModule } from './module';

const highlights: ModuleHighlight[] = [
  { icon: Sprout, titleKey: 'insights.planGrowth', bodyKey: 'insights.planGrowthBody' },
  { icon: ChartLine, titleKey: 'insights.planAttendance', bodyKey: 'insights.planAttendanceBody' },
  {
    icon: MapPinned,
    titleKey: 'insights.planDemographics',
    bodyKey: 'insights.planDemographicsBody',
  },
  { icon: BellRing, titleKey: 'insights.planAlerts', bodyKey: 'insights.planAlertsBody' },
  { icon: Download, titleKey: 'insights.planExport', bodyKey: 'insights.planExportBody' },
];

export function ReportsPage() {
  return <ModuleComingSoon module={insightsModule} highlights={highlights} />;
}
