import { can } from '@tatagereja/shared';
import type { ReactNode } from 'react';
import { Link, useMatches } from 'react-router';
import { Button } from '@/components/ui/button';
import { NoAccessState } from '@/components/ui/states';
import { moduleManifest, useModuleContext } from '@/features/registry';
import { useI18n } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { evaluateAccess, type ModuleRouteHandle } from '@/lib/modules';

/**
 * Shows a friendly state instead of a module page the caller may not open: the module is
 * switched off for the church, or the route's access rule fails. Driven by the `handle` of
 * the matched module routes; the API refuses the data regardless.
 */
export function ModuleRouteGuard({ children }: { children: ReactNode }) {
  const matches = useMatches();
  const context = useModuleContext();
  const { t } = useI18n();
  const handles = matches
    .map((match) => match.handle as ModuleRouteHandle | undefined)
    .filter((handle): handle is ModuleRouteHandle => !!handle?.moduleId);

  const disabled = handles.find((handle) => handle.moduleId && !context.isEnabled(handle.moduleId));
  const denied = handles.find((handle) => !evaluateAccess(handle.access, context));
  const blockedModule = disabled?.moduleId ? moduleManifest(disabled.moduleId) : undefined;
  useDocumentTitle(disabled || denied ? t('common.noAccessTitle') : null);

  if (disabled) {
    return (
      <NoAccessState
        variant="module-off"
        moduleName={blockedModule ? t(blockedModule.labelKey) : undefined}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link to={context.base}>{t('common.goHome')}</Link>
            </Button>
            {can.manageSettings(context.access) ? (
              <Button asChild variant="outline">
                <Link to={`${context.base}/settings`}>{t('common.openSettings')}</Link>
              </Button>
            ) : null}
          </div>
        }
      />
    );
  }
  if (denied) {
    return (
      <NoAccessState
        action={
          <Button asChild>
            <Link to={context.base}>{t('common.goHome')}</Link>
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
