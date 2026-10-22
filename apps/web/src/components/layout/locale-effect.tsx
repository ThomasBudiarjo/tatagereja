import { useEffect } from 'react';
import { z } from 'zod';
import zodEnglish from 'zod/v4/locales/en.js';
import zodIndonesian from 'zod/v4/locales/id.js';
import { useLocale } from '@/lib/i18n';

/** Keeps `<html lang>` and the language of form validation messages in step with the interface. */
export function LocaleEffect() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    z.config(locale === 'id' ? zodIndonesian() : zodEnglish());
  }, [locale]);
  return null;
}
