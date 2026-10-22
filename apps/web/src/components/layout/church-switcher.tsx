import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, LayoutList, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { EntityAvatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { myChurchesQuery } from '@/features/churches/api';
import { useI18n } from '@/lib/i18n';
import { ROLE_KEYS } from '@/lib/i18n/labels';
import { cn } from '@/lib/utils';
import { useChurch } from './church-provider';

/**
 * The church at the top of the navigation, opening a list of the person's other churches.
 * The list loads when the menu opens.
 */
export function ChurchSwitcher({
  collapsed = false,
  compact = false,
  className,
}: {
  /** Only the logo (collapsed sidebar). */
  collapsed?: boolean;
  /** The phone top bar: logo and name, no role. */
  compact?: boolean;
  className?: string;
}) {
  const { church, access } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const churches = useQuery({ ...myChurchesQuery(), enabled: open });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('common.switchChurch')}
          className={cn(
            'flex min-w-0 items-center gap-3 rounded-xl text-left transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-muted',
            collapsed ? 'size-11 justify-center' : compact ? 'h-11 px-1.5 pr-2.5' : 'w-full p-1.5',
            className,
          )}
        >
          <EntityAvatar
            name={church.name}
            src={church.logoUrl}
            color={church.brandColor}
            size={compact || collapsed ? 'sm' : 'md'}
            square
          />
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] leading-tight font-bold tracking-tight">
                  {church.name}
                </span>
                {!compact ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {t(ROLE_KEYS[access.role])}
                  </span>
                ) : null}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t('common.switchChurch')}</DropdownMenuLabel>
        {churches.isPending ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          (churches.data?.items ?? []).map((item) => (
            <DropdownMenuItem
              key={item.church.id}
              disabled={item.status === 'suspended'}
              onSelect={() => {
                if (item.church.id !== church.id) navigate(`/c/${item.church.id}`);
              }}
              className="py-2"
            >
              <EntityAvatar
                name={item.church.name}
                src={item.church.logoUrl}
                color={item.church.brandColor}
                size="sm"
                square
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.church.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.status === 'suspended'
                    ? t('common.statusSuspended')
                    : t(ROLE_KEYS[item.role])}
                </span>
              </span>
              {item.church.id === church.id ? (
                <Check className="size-4 text-primary" aria-label={t('common.currentChurch')} />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/churches')}>
          <LayoutList /> {t('common.allChurches')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/churches/new')}>
          <Plus /> {t('common.createChurch')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
