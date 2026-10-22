import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyIllustration } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/lib/i18n';

/**
 * The top-bar notifications slot. A placeholder until the comms module connects it to the
 * inbox API (`/api/notifications`: unread count, list, mark read).
 */
export function NotificationsBell() {
  const { t } = useI18n();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-muted-foreground hover:text-foreground"
          aria-label={t('common.notifications')}
        >
          <Bell className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="font-semibold">{t('common.notifications')}</p>
        </div>
        <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
          <EmptyIllustration icon={Bell} tone="amber" size="sm" />
          <div>
            <p className="text-sm font-semibold">{t('comms.notificationsEmpty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('comms.notificationsEmptyHint')}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
