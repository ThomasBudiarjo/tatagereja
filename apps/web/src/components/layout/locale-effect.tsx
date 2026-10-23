import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { z } from 'zod';
import zodEnglish from 'zod/v4/locales/en.js';
import zodIndonesian from 'zod/v4/locales/id.js';
import { useLocale } from '@/lib/i18n';

/**
 * Keeps `<html lang>` and the language of form validation messages in step with the interface,
 * and refetches what the server wrote in the old language (notifications) after a switch.
 */
export function LocaleEffect() {
  const locale = useLocale();
  const client = useQueryClient();
  const previous = useRef(locale);
  useEffect(() => {
    document.documentElement.lang = locale;
    z.config(locale === 'id' ? zodIndonesian() : zodEnglish());
    if (previous.current !== locale) {
      previous.current = locale;
      void client.invalidateQueries();
    }
  }, [locale, client]);
  return null;
}
