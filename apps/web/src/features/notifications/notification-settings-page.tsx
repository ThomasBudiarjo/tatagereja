import { MODULES, isModuleEnabled, localize, type NotificationType } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { notificationDefinition, preferencesQuery, useUpdatePreference } from './api';
import { notificationVisual } from './notification-visuals';

/** Per-type notification preferences, grouped by module. Switches save at once. */
export function NotificationSettingsPage() {
  const { t, locale } = useI18n();
  const { church, base } = useChurch();
  const query = useQuery(preferencesQuery());
  const update = useUpdatePreference();

  const toggle = (type: NotificationType, inApp: boolean) =>
    update.mutate(
      { type, inApp },
      {
        onSuccess: () => toast.success(inApp ? t('comms.prefOn') : t('comms.prefOff')),
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );

  const sections = MODULES.filter((module) => isModuleEnabled(church.enabledModules, module.id))
    .map((module) => ({
      module,
      items: (query.data?.items ?? []).filter(
        (item) => notificationDefinition(item.type)?.module === module.id,
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <Page>
      <PageHeader
        title={t('comms.notificationSettings')}
        description={t('comms.prefsDescription')}
        icon={BellRing}
        tone="amber"
        breadcrumbs={[
          { label: t('common.notifications'), to: `${base}/notifications` },
          { label: t('comms.notificationSettings') },
        ]}
      />
      {query.isPending ? (
        <SkeletonList rows={8} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(({ module, items }) => (
            <Section key={module.id} title={localize(module.label, locale)}>
              <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
                {items.map((item) => {
                  const definition = notificationDefinition(item.type);
                  if (!definition) return null;
                  const { icon, tone } = notificationVisual(item.type);
                  const id = `pref-${item.type.replace(/\W/g, '-')}`;
                  return (
                    <li key={item.type} className="flex min-h-16 items-center gap-3 px-4 py-3">
                      <ToneIcon icon={icon} tone={tone} size="sm" />
                      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block text-sm font-medium">
                          {localize(definition.label, locale)}
                        </span>
                        <span className="block text-[13px] text-muted-foreground">
                          {localize(definition.description, locale)}
                        </span>
                      </label>
                      {item.mandatory ? (
                        <StatusBadge tone="neutral" icon={Lock} size="sm">
                          {t('comms.prefAlways')}
                        </StatusBadge>
                      ) : (
                        <Switch
                          id={id}
                          checked={item.inApp}
                          onCheckedChange={(checked) =>
                            toggle(item.type as NotificationType, checked)
                          }
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          ))}
          <p className="px-1 text-xs text-muted-foreground">{t('comms.prefsFootnote')}</p>
        </div>
      )}
    </Page>
  );
}
