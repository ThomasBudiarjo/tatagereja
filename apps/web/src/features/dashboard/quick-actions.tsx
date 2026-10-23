import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ToneIcon } from '@/components/ui/status-badge';
import { useModuleMenu } from '@/features/registry';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Shown before "show all": one row of four on phones, two rows on wider screens. */
const PHONE_COUNT = 4;
const WIDE_COUNT = 8;

/**
 * The home shortcuts every module registers, limited to what the caller may do. Churches with
 * many modules get a long list, so it starts folded and opens with one tap.
 */
export function HomeQuickActions() {
  const { t } = useI18n();
  const { quickActions } = useModuleMenu();
  const [expanded, setExpanded] = useState(false);
  if (quickActions.length === 0) return null;
  const foldable = quickActions.length > PHONE_COUNT;
  const visible = expanded ? quickActions : quickActions.slice(0, WIDE_COUNT);
  return (
    <div className="flex flex-col gap-2">
      <ul id="home-quick-actions" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {visible.map((action, index) => (
          <li
            key={`${action.moduleId}-${action.id}`}
            className={cn(!expanded && index >= PHONE_COUNT && 'max-sm:hidden')}
          >
            <Link
              to={action.href}
              className="pressable flex h-full min-h-14 items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-sm font-semibold shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <ToneIcon icon={action.icon} tone={action.tone} size="sm" />
              <span className="min-w-0 leading-snug">{t(action.labelKey)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {foldable ? (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls="home-quick-actions"
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            'self-center text-muted-foreground',
            quickActions.length <= WIDE_COUNT && 'sm:hidden',
          )}
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
          {expanded
            ? t('dashboard.fewerActions')
            : t('dashboard.allActions', { count: quickActions.length })}
        </Button>
      ) : null}
    </div>
  );
}
