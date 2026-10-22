import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd, modifierKey } from '@/components/ui/kbd';
import { useModuleMenu } from '@/features/registry';
import { useI18n } from '@/lib/i18n';
import { useCommandPalette } from '@/stores/command-palette';
import { ChurchSwitcher } from './church-switcher';
import { UserMenu } from './user-menu';

/**
 * The bar above church pages. Phones: church switcher, search, module slots (notifications)
 * and the account. Desktops: a wide search field and the module slots.
 */
export function TopBar() {
  const { t } = useI18n();
  const { topBar } = useModuleMenu();
  const openPalette = useCommandPalette((state) => state.setOpen);

  return (
    <header
      data-print="hide"
      className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-lg safe-top"
    >
      <div className="flex h-14 items-center gap-1 px-2 sm:px-4 md:h-16 md:px-6">
        <div className="min-w-0 flex-1 md:hidden">
          <ChurchSwitcher compact className="max-w-full" />
        </div>
        <button
          type="button"
          onClick={() => openPalette(true)}
          className="hidden h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-input bg-card px-3.5 text-sm text-muted-foreground shadow-xs transition-colors outline-none hover:border-ring/40 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 md:flex"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">{t('common.commandPlaceholder')}</span>
          <Kbd>{modifierKey()}</Kbd>
          <Kbd className="-ml-1.5">K</Kbd>
        </button>
        <div className="hidden flex-1 md:block" />
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-muted-foreground hover:text-foreground md:hidden"
          onClick={() => openPalette(true)}
          aria-label={t('common.commandOpen')}
        >
          <Search className="size-5" />
        </Button>
        {topBar.map((Slot, index) => (
          <Slot key={index} />
        ))}
        <UserMenu className="md:hidden" />
      </div>
    </header>
  );
}
