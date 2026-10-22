import { localize, moduleDefinition, type ChurchModuleState } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { ErrorState } from '@/components/ui/misc';
import { SkeletonList } from '@/components/ui/skeleton';
import { ToneIcon } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { moduleManifest } from '@/features/registry';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { modulesQuery, useToggleModule } from '../api';
import { SettingsPage } from './layout';

function ModuleRow({
  module,
  onToggle,
  busy,
}: {
  module: ChurchModuleState;
  onToggle?: (enabled: boolean) => void;
  busy: boolean;
}) {
  const { t, locale } = useI18n();
  const definition = moduleDefinition(module.id);
  const manifest = moduleManifest(module.id);
  const switchId = `module-${module.id}`;
  return (
    <li
      className={cn(
        'flex items-center gap-3 px-4 py-3.5 transition-opacity duration-200',
        module.optional && !module.enabled && 'opacity-70',
      )}
    >
      {manifest ? <ToneIcon icon={manifest.icon} tone={manifest.accent} /> : null}
      <div className="min-w-0 flex-1">
        <label htmlFor={switchId} className="block font-semibold tracking-tight">
          {localize(definition.label, locale)}
        </label>
        <p className="text-sm text-pretty text-muted-foreground">
          {localize(definition.description, locale)}
        </p>
      </div>
      {module.optional ? (
        <Switch
          id={switchId}
          checked={module.enabled}
          disabled={busy}
          onCheckedChange={(checked) => onToggle?.(checked)}
          aria-describedby={`${switchId}-state`}
        />
      ) : (
        <Lock
          className="size-4 shrink-0 text-muted-foreground"
          aria-label={t('admin-security.moduleAlwaysOn')}
        />
      )}
      <span id={`${switchId}-state`} className="sr-only">
        {module.enabled ? t('admin-security.moduleOn') : t('admin-security.moduleOff')}
      </span>
    </li>
  );
}

export function ModulesSettingsPage() {
  const { t, locale } = useI18n();
  const { churchId } = useChurch();
  const query = useQuery(modulesQuery(churchId));
  const [turningOff, setTurningOff] = useState<ChurchModuleState | null>(null);
  const toggle = useMutationToast(useToggleModule(churchId), {
    success: (_data, variables) =>
      t(variables.enabled ? 'admin-security.moduleEnabled' : 'admin-security.moduleDisabled', {
        module: localize(moduleDefinition(variables.id).label, locale),
      }),
  });

  const optional = query.data?.items.filter((item) => item.optional) ?? [];
  const required = query.data?.items.filter((item) => !item.optional) ?? [];

  return (
    <SettingsPage section="modules" description={t('admin-security.modulesDescription')}>
      {query.isPending ? (
        <SkeletonList rows={6} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <>
          <Section
            title={t('admin-security.optionalModules')}
            description={t('admin-security.optionalModulesHint', {
              on: optional.filter((item) => item.enabled).length,
              total: optional.length,
            })}
          >
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
              {optional.map((module) => (
                <ModuleRow
                  key={module.id}
                  module={module}
                  busy={toggle.isPending}
                  onToggle={(enabled) => {
                    if (enabled) void toggle.run({ id: module.id, enabled });
                    else setTurningOff(module);
                  }}
                />
              ))}
            </ul>
          </Section>
          <Section
            title={t('admin-security.requiredModules')}
            description={t('admin-security.requiredModulesHint')}
          >
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
              {required.map((module) => (
                <ModuleRow key={module.id} module={module} busy={false} />
              ))}
            </ul>
          </Section>
        </>
      )}
      <ConfirmDialog
        open={!!turningOff}
        onOpenChange={(open) => !open && setTurningOff(null)}
        title={t('admin-security.moduleOffTitle', {
          module: turningOff ? localize(moduleDefinition(turningOff.id).label, locale) : '',
        })}
        description={t('admin-security.moduleOffBody')}
        confirmLabel={t('admin-security.turnOff')}
        loading={false}
        onConfirm={() => {
          if (!turningOff) return;
          const id = turningOff.id;
          setTurningOff(null);
          void toggle.run({ id, enabled: false });
        }}
      />
    </SettingsPage>
  );
}
