import type { Locale } from '@tatagereja/shared';
import {
  ChevronsUpDown,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Repeat,
  Sun,
  UserCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { EntityAvatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '@/features/auth/api';
import { useI18n } from '@/lib/i18n';
import { LANGUAGE_NAMES, useChangeLanguage } from '@/lib/i18n/labels';
import { cn } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { useUiStore, type ThemePreference } from '@/stores/ui';

/** Account menu: profile, language, theme, switching church and signing out. */
export function UserMenu({
  variant = 'avatar',
  collapsed = false,
  className,
}: {
  /** `row` is the full-width entry at the bottom of the sidebar. */
  variant?: 'avatar' | 'row';
  collapsed?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const logout = useLogout();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const changeLanguage = useChangeLanguage();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'row' && !collapsed ? (
          <button
            type="button"
            className={cn(
              'flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-muted',
              className,
            )}
            aria-label={t('common.accountMenu')}
          >
            <EntityAvatar name={user.name} src={user.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
              className,
            )}
            aria-label={t('common.accountMenu')}
          >
            <EntityAvatar name={user.name} src={user.avatarUrl} size="sm" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={variant === 'row' ? 'top' : 'bottom'} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
          <EntityAvatar name={user.name} src={user.avatarUrl} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {user.name}
            </span>
            <span className="block truncate text-xs">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <UserCircle /> {t('common.accountSettings')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/churches')}>
          <Repeat /> {t('common.switchChurch')}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages /> {t('common.language')}
            <span className="ml-auto text-xs text-muted-foreground">{locale.toUpperCase()}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={locale}
              onValueChange={(value) => changeLanguage(value as Locale)}
            >
              {(Object.keys(LANGUAGE_NAMES) as Locale[]).map((value) => (
                <DropdownMenuRadioItem key={value} value={value} lang={value}>
                  {LANGUAGE_NAMES[value]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === 'dark' ? <Moon /> : theme === 'light' ? <Sun /> : <Monitor />}
            {t('common.theme')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => setTheme(value as ThemePreference)}
            >
              <DropdownMenuRadioItem value="system">
                <Monitor /> {t('common.themeSystem')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light">
                <Sun /> {t('common.themeLight')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> {t('common.themeDark')}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive disabled={logout.isPending} onSelect={() => logout.mutate()}>
          <LogOut /> {t('common.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
