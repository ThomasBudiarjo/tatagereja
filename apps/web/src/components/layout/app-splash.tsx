import { Church } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/** Full-screen loading state while the church or the first screen loads. */
export function AppSplash() {
  const { t } = useI18n();
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex size-14 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/20 [animation-duration:1.6s]" />
        <span className="relative flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-raised">
          <Church className="size-7" />
        </span>
      </span>
      <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
    </div>
  );
}
