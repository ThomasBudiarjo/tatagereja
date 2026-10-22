import type { Message, Messages } from '@/lib/i18n/define';

/**
 * One part of the module dictionary. English defines the keys and Indonesian must translate
 * each of them, as in `defineDictionary`; `i18n.ts` merges the parts under one namespace.
 */
export const messages = <M extends Messages>(en: M, id: { [K in keyof M]: Message }) => ({
  en,
  id,
});
