import { type ChurchWithAccess } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { churchQuery } from '@/features/churches/api';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { FormatSettingsContext, useI18n } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import { AppSplash } from './app-splash';

/**
 * The current church and the caller's access. Decide what to show with the shared `can.*`
 * and `has()` rules on `access`, never with the base role.
 */
export type ChurchContextValue = ChurchWithAccess & {
  churchId: string;
  base: string;
};

const ChurchContext = createContext<ChurchContextValue | null>(null);

export function ChurchProvider({ children }: { children: ReactNode }) {
  const { churchId } = useParams<{ churchId: string }>();
  const { t } = useI18n();
  const setLastChurchId = useUiStore((state) => state.setLastChurchId);
  const query = useQuery({ ...churchQuery(churchId ?? ''), enabled: !!churchId });

  useEffect(() => {
    if (query.data) setLastChurchId(query.data.church.id);
  }, [query.data, setLastChurchId]);

  useEffect(() => {
    if (
      query.isError &&
      isApiClientError(query.error) &&
      [403, 404, 422].includes(query.error.status)
    ) {
      setLastChurchId(null);
    }
  }, [query.isError, query.error, setLastChurchId]);

  const value = useMemo<ChurchContextValue | null>(
    () =>
      query.data
        ? { ...query.data, churchId: query.data.church.id, base: `/c/${query.data.church.id}` }
        : null,
    [query.data],
  );
  const format = useMemo(
    () => ({
      timeZone: query.data?.church.timezone,
      currency: query.data?.church.currency ?? 'IDR',
    }),
    [query.data?.church.timezone, query.data?.church.currency],
  );

  if (!churchId) return <Navigate to="/churches" replace />;
  if (query.isPending) return <AppSplash />;
  if (query.isError || !value) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-6">
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
        <Button asChild variant="ghost" className="w-full">
          <Link to="/churches">
            <ArrowLeft />
            {t('common.allChurches')}
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <ChurchContext.Provider value={value}>
      <FormatSettingsContext.Provider value={format}>{children}</FormatSettingsContext.Provider>
    </ChurchContext.Provider>
  );
}

export function useChurch(): ChurchContextValue {
  const value = useContext(ChurchContext);
  if (!value) throw new Error('useChurch must be used inside a ChurchProvider');
  return value;
}

/** The church when inside one (shared components that also render outside churches). */
export function useOptionalChurch(): ChurchContextValue | null {
  return useContext(ChurchContext);
}
