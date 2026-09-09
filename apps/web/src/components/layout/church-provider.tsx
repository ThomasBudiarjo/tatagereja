import { isAdminRole, type ChurchWithAccess } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ErrorState, PageLoader } from '@/components/ui/misc';
import { churchQuery } from '@/features/churches/api';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useUiStore } from '@/stores/ui';

export type ChurchContextValue = ChurchWithAccess & {
  churchId: string;
  base: string;
  isAdmin: boolean;
};

const ChurchContext = createContext<ChurchContextValue | null>(null);

export function ChurchProvider({ children }: { children: ReactNode }) {
  const { churchId } = useParams<{ churchId: string }>();
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

  if (!churchId) return <Navigate to="/churches" replace />;
  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        <Button asChild variant="link" className="mt-3 w-full">
          <Link to="/churches">Back to my churches</Link>
        </Button>
      </div>
    );
  }
  const value: ChurchContextValue = {
    ...query.data,
    churchId: query.data.church.id,
    base: `/c/${query.data.church.id}`,
    isAdmin: isAdminRole(query.data.access.role),
  };
  return <ChurchContext.Provider value={value}>{children}</ChurchContext.Provider>;
}

export function useChurch(): ChurchContextValue {
  const value = useContext(ChurchContext);
  if (!value) throw new Error('useChurch must be used inside a ChurchProvider');
  return value;
}
