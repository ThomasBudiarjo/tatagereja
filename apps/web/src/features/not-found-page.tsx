import { ArrowLeft, Compass } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { EmptyIllustration } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { cn } from '@/lib/utils';

export function NotFoundPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  useDocumentTitle(t('common.notFoundTitle'));
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-5 p-6 text-center',
        embedded ? 'py-16' : 'min-h-dvh',
      )}
    >
      <EmptyIllustration icon={Compass} tone="sky" />
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="text-overline text-muted-foreground">404</p>
        <h1 className="text-2xl font-bold tracking-tight">{t('common.notFoundTitle')}</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {t('common.notFoundDescription')}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft />
          {t('common.goBack')}
        </Button>
        <Button asChild>
          <Link to="/">{t('common.goHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
