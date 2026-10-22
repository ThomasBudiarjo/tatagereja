import { Link } from 'react-router';
import { ToneIcon } from '@/components/ui/status-badge';
import { useModuleMenu } from '@/features/registry';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Home shortcuts registered by modules, limited to what the caller may do. */
export function QuickActions({ className }: { className?: string }) {
  const { t } = useI18n();
  const { quickActions } = useModuleMenu();
  if (quickActions.length === 0) return null;
  return (
    <ul className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-4', className)}>
      {quickActions.map((action) => (
        <li key={`${action.moduleId}-${action.id}`}>
          <Link
            to={action.href}
            className="pressable flex h-full items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-sm font-semibold shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <ToneIcon icon={action.icon} tone={action.tone} size="sm" />
            <span className="min-w-0 leading-snug">{t(action.labelKey)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
