import { CalendarRange, Megaphone, Newspaper, Share2 } from 'lucide-react';
import { ModuleComingSoon, type ModuleHighlight } from '@/components/layout/module-coming-soon';
import { defineModule } from '@/lib/modules';
import { commsModule } from './module';

const highlights: ModuleHighlight[] = [
  { icon: Newspaper, titleKey: 'comms.planBulletin', bodyKey: 'comms.planBulletinBody' },
  { icon: Share2, titleKey: 'comms.planShare', bodyKey: 'comms.planShareBody' },
  { icon: Megaphone, titleKey: 'comms.planAudience', bodyKey: 'comms.planAudienceBody' },
  { icon: CalendarRange, titleKey: 'comms.planCalendar', bodyKey: 'comms.planCalendarBody' },
];

/** The bulletin landing page presents the Warta Jemaat entry of the comms module. */
const bulletinModule = defineModule({
  ...commsModule,
  icon: Newspaper,
  labelKey: 'comms.bulletins',
  descriptionKey: 'comms.bulletinsDescription',
});

export function BulletinsPage() {
  return <ModuleComingSoon module={bulletinModule} highlights={highlights} />;
}
