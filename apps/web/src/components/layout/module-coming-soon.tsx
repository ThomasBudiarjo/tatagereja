import { localize, PERMISSION_DEFINITIONS } from '@tatagereja/shared';
import { CheckCircle2, Sparkles } from 'lucide-react';
import type * as React from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EmptyIllustration } from '@/components/ui/empty-state';
import { ToneIcon } from '@/components/ui/status-badge';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { MODULE_SECTIONS, type ModuleManifest } from '@/lib/modules';

export type ModuleHighlight = {
  icon: React.ComponentType<{ className?: string }>;
  titleKey: MessageKey;
  bodyKey: MessageKey;
};

/**
 * The landing page of a module that is still being built: what it will do, and which of its
 * permissions the caller already holds. Module owners replace it with their real screens.
 */
export function ModuleComingSoon({
  module,
  highlights,
}: {
  module: ModuleManifest;
  highlights: ModuleHighlight[];
}) {
  const { t, locale } = useI18n();
  const { access } = useChurch();
  const label = t(module.labelKey);
  const section = MODULE_SECTIONS.find((item) => item.id === module.section);
  const held = PERMISSION_DEFINITIONS.filter(
    (definition) => definition.module === module.id && access.permissions.includes(definition.key),
  );

  return (
    <Page size="wide">
      <PageHeader
        icon={module.icon}
        tone={module.accent}
        eyebrow={section ? t(section.labelKey) : undefined}
        title={label}
        description={module.descriptionKey ? t(module.descriptionKey) : undefined}
      />

      <div
        data-tone={module.accent}
        className="relative flex animate-rise-in flex-col items-center gap-5 overflow-hidden rounded-2xl border border-tone/20 bg-linear-to-br from-tone-soft via-card to-card p-6 text-center shadow-soft sm:flex-row sm:p-8 sm:text-left"
      >
        <EmptyIllustration icon={module.icon} tone={module.accent} />
        <div className="flex max-w-xl flex-col gap-2">
          <p className="inline-flex items-center justify-center gap-1.5 text-overline text-tone-ink sm:justify-start">
            <Sparkles className="size-3.5" aria-hidden />
            {t('common.comingPlanned')}
          </p>
          <h2 className="text-xl font-bold tracking-tight text-balance">
            {t('common.comingTitle', { module: label })}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {t('common.comingDescription')}
          </p>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {highlights.map((highlight, index) => (
          <li
            key={highlight.titleKey}
            className="flex animate-rise-in gap-3.5 rounded-xl border border-border/70 bg-card p-4 shadow-soft"
            style={{ animationDelay: `${60 + index * 40}ms` }}
          >
            <ToneIcon icon={highlight.icon} tone={module.accent} />
            <div className="min-w-0">
              <p className="font-semibold tracking-tight">{t(highlight.titleKey)}</p>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">
                {t(highlight.bodyKey)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <Section title={t('common.comingPermissions')}>
        {held.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {held.map((definition) => (
              <li
                key={definition.key}
                data-tone="success"
                className="inline-flex items-center gap-1.5 rounded-full bg-tone-soft px-3 py-1.5 text-sm font-medium text-tone-ink"
                title={localize(definition.description, locale)}
              >
                <CheckCircle2 className="size-4" aria-hidden />
                {localize(definition.label, locale)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('common.comingNoPermissions')}</p>
        )}
      </Section>
    </Page>
  );
}
