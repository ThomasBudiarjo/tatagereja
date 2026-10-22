import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { ToneIcon } from '@/components/ui/status-badge';
import type { MenuItem } from '@/features/registry';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Menu entries as tappable tiles, coloured by their module. */
export function ModuleTiles({ items, className }: { items: MenuItem[]; className?: string }) {
  const { t } = useI18n();
  return (
    <ul className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}>
      {items.map((item, index) => (
        <li
          key={`${item.moduleId}-${item.id}`}
          className="animate-rise-in"
          style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
        >
          <Link
            to={item.href}
            className="pressable group flex h-full flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <div className="flex items-start justify-between">
              <ToneIcon icon={item.icon} tone={item.tone} />
              <ChevronRight
                className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <p className="text-[0.9375rem] leading-snug font-semibold tracking-tight">
                {t(item.labelKey)}
              </p>
              {item.descriptionKey ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {t(item.descriptionKey)}
                </p>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
