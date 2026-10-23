import { ArrowLeft, SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { isGone } from '@/lib/use-mutation-toast';

/** Gone, or a link whose id is malformed (the API refuses the route parameters with 422). */
const isUnavailable = (error: unknown) =>
  isGone(error) || (isApiClientError(error) && error.status === 422);

/**
 * A detail page that failed to load: a calm "not available" with a way back when the item is
 * gone (404, which is also what the API answers for items not meant for the caller) or the
 * link is broken, otherwise the error with a retry.
 */
export function DetailLoadError({
  error,
  goneTitle,
  goneBody,
  backTo,
  backLabel,
  onRetry,
  retrying,
}: {
  error: unknown;
  goneTitle: string;
  goneBody: string;
  backTo: string;
  backLabel: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (isUnavailable(error)) {
    return (
      <EmptyState
        icon={SearchX}
        tone="slate"
        title={goneTitle}
        description={goneBody}
        action={
          <Button asChild variant="outline">
            <Link to={backTo}>
              <ArrowLeft />
              {backLabel}
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <ErrorState
      error={error}
      message={getErrorMessage(error)}
      onRetry={onRetry}
      retrying={retrying}
    />
  );
}
