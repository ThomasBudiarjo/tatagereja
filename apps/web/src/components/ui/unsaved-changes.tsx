import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { useI18n } from '@/lib/i18n';
import { ConfirmDialog } from './alert-dialog';

/**
 * Asks before leaving a long form with unsaved changes, both for in-app navigation and for
 * closing or reloading the tab. Render the returned element anywhere in the form.
 *
 * ```tsx
 * const { isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
 * const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful);
 * return <form>...{guard}</form>;
 * ```
 * Navigating away from inside the submit handler is allowed: the form is submitting then.
 */
export function useUnsavedChangesGuard(when: boolean) {
  const { t } = useI18n();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  // A form that became clean (saved) lets a pending navigation through.
  useEffect(() => {
    if (blocker.state === 'blocked' && !when) blocker.proceed();
  }, [blocker, when]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset();
      }}
      title={t('common.unsavedTitle')}
      description={t('common.unsavedDescription')}
      confirmLabel={t('common.unsavedLeave')}
      cancelLabel={t('common.unsavedStay')}
      onConfirm={() => blocker.proceed?.()}
    />
  );
}
