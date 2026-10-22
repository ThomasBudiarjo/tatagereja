import { BookOpen, CalendarCheck, ListMusic, UsersRound } from 'lucide-react';
import { ModuleComingSoon, type ModuleHighlight } from '@/components/layout/module-coming-soon';
import { worshipModule } from './module';

const highlights: ModuleHighlight[] = [
  { icon: BookOpen, titleKey: 'worship.planServices', bodyKey: 'worship.planServicesBody' },
  { icon: ListMusic, titleKey: 'worship.planSongs', bodyKey: 'worship.planSongsBody' },
  { icon: UsersRound, titleKey: 'worship.planTeams', bodyKey: 'worship.planTeamsBody' },
  { icon: CalendarCheck, titleKey: 'worship.planRoster', bodyKey: 'worship.planRosterBody' },
];

export function WorshipHomePage() {
  return <ModuleComingSoon module={worshipModule} highlights={highlights} />;
}
