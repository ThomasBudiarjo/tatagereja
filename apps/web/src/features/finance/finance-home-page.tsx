import {
  ChartColumnIncreasing,
  HandCoins,
  HeartHandshake,
  LockKeyhole,
  PiggyBank,
  Receipt,
} from 'lucide-react';
import { ModuleComingSoon, type ModuleHighlight } from '@/components/layout/module-coming-soon';
import { financeModule } from './module';

const highlights: ModuleHighlight[] = [
  { icon: HandCoins, titleKey: 'finance.planOfferings', bodyKey: 'finance.planOfferingsBody' },
  { icon: HeartHandshake, titleKey: 'finance.planGiving', bodyKey: 'finance.planGivingBody' },
  { icon: Receipt, titleKey: 'finance.planExpenses', bodyKey: 'finance.planExpensesBody' },
  { icon: PiggyBank, titleKey: 'finance.planBudget', bodyKey: 'finance.planBudgetBody' },
  {
    icon: ChartColumnIncreasing,
    titleKey: 'finance.planReports',
    bodyKey: 'finance.planReportsBody',
  },
  { icon: LockKeyhole, titleKey: 'finance.planClosing', bodyKey: 'finance.planClosingBody' },
];

export function FinanceHomePage() {
  return <ModuleComingSoon module={financeModule} highlights={highlights} />;
}
