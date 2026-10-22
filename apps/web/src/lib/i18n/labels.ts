import type { ChurchRole, Locale } from '@tatagereja/shared';
import { toast } from 'sonner';
import { useUiStore } from '@/stores/ui';
import { translate, type MessageKey } from './index';

/** Language names are written in their own language. */
export const LANGUAGE_NAMES: Record<Locale, string> = { id: 'Bahasa Indonesia', en: 'English' };

export const ROLE_KEYS: Record<ChurchRole, MessageKey> = {
  owner: 'common.roleOwner',
  administrator: 'common.roleAdministrator',
  member: 'common.roleMember',
};

/** Changes the interface language and confirms it in the new language. */
export function useChangeLanguage() {
  const setLocale = useUiStore((state) => state.setLocale);
  return (locale: Locale) => {
    setLocale(locale);
    toast.success(translate(locale, 'common.languageChanged'));
  };
}
