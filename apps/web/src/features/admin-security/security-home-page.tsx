import { DatabaseBackup, FileClock, KeyRound, LogIn, ShieldAlert, Smartphone } from 'lucide-react';
import { ModuleComingSoon, type ModuleHighlight } from '@/components/layout/module-coming-soon';
import { adminSecurityModule } from './module';

const highlights: ModuleHighlight[] = [
  { icon: KeyRound, titleKey: 'admin-security.planRoles', bodyKey: 'admin-security.planRolesBody' },
  {
    icon: FileClock,
    titleKey: 'admin-security.planAudit',
    bodyKey: 'admin-security.planAuditBody',
  },
  {
    icon: Smartphone,
    titleKey: 'admin-security.planTwoFactor',
    bodyKey: 'admin-security.planTwoFactorBody',
  },
  {
    icon: ShieldAlert,
    titleKey: 'admin-security.planPolicy',
    bodyKey: 'admin-security.planPolicyBody',
  },
  { icon: LogIn, titleKey: 'admin-security.planLogins', bodyKey: 'admin-security.planLoginsBody' },
  {
    icon: DatabaseBackup,
    titleKey: 'admin-security.planExport',
    bodyKey: 'admin-security.planExportBody',
  },
];

export function SecurityHomePage() {
  return <ModuleComingSoon module={adminSecurityModule} highlights={highlights} />;
}
