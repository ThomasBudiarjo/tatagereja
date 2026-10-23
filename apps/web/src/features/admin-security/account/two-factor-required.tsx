import { ArrowLeft, ShieldAlert, Smartphone } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EmptyIllustration } from '@/components/ui/empty-state';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useI18n } from '@/lib/i18n';

/**
 * Shown instead of a church whose security policy asks the caller for two-step verification
 * they have not set up (403 TWO_FACTOR_SETUP_REQUIRED). It explains why and leads straight
 * to the setup, which returns to the church afterwards.
 */
export function TwoFactorRequiredState({ churchId }: { churchId: string }) {
  const { t } = useI18n();
  useDocumentTitle(t('profile.requiredScreenTitle'));
  const back = encodeURIComponent(`/c/${churchId}`);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md animate-rise-in flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      <EmptyIllustration icon={ShieldAlert} tone="warning" />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold tracking-tight text-balance">
          {t('profile.requiredScreenTitle')}
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {t('profile.requiredScreenBody')}
        </p>
      </div>
      <ol className="flex w-full flex-col gap-2 rounded-xl border border-border/70 bg-card p-4 text-left text-sm shadow-soft">
        {(['requiredStep1', 'requiredStep2', 'requiredStep3'] as const).map((key, index) => (
          <li key={key} className="flex items-start gap-3">
            <span
              data-tone="brand"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tone-soft text-xs font-bold text-tone-ink"
            >
              {index + 1}
            </span>
            <span className="pt-0.5">{t(`profile.${key}`)}</span>
          </li>
        ))}
      </ol>
      <div className="flex w-full flex-col gap-2">
        <Button asChild size="lg">
          <Link to={`/profile?tab=security&setup=1&returnTo=${back}`}>
            <Smartphone />
            {t('profile.requiredScreenAction')}
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/churches">
            <ArrowLeft />
            {t('common.allChurches')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
