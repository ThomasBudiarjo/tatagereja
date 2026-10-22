import { HandHeart } from 'lucide-react';
import { ModuleTiles } from '@/components/layout/module-tiles';
import { Page, PageHeader } from '@/components/layout/page';
import { EmptyState } from '@/components/ui/empty-state';
import { useModuleMenu } from '@/features/registry';
import { useI18n } from '@/lib/i18n';

/** The phone "Ministry" tab: groups, worship, care, the registry and check-in. */
export function MinistryPage() {
  const { t } = useI18n();
  const { sections } = useModuleMenu();
  const items = sections.find((section) => section.id === 'ministry')?.items ?? [];
  return (
    <Page size="wide">
      <PageHeader
        icon={HandHeart}
        tone="violet"
        title={t('core.ministryTitle')}
        description={t('common.ministryHubDescription')}
      />
      {items.length > 0 ? (
        <ModuleTiles items={items} />
      ) : (
        <EmptyState
          icon={HandHeart}
          tone="violet"
          title={t('core.ministryEmpty')}
          description={t('core.ministryEmptyHint')}
        />
      )}
    </Page>
  );
}
