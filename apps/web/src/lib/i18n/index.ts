import { LOCALES, type Locale } from '@tatagereja/shared';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { DICTIONARIES, type MessageKey } from '@/features/dictionaries';
import { useUiStore } from '@/stores/ui';
import type { Message, MessageParams } from './define';
import {
  formatCurrency,
  formatDate,
  formatDateRange,
  formatList,
  formatNumber,
  formatPercent,
  formatRelative,
  pluralCategory,
  type DatePreset,
  type DateFormatOptions,
} from './format';

export type { MessageKey } from '@/features/dictionaries';
export type { MessageParams } from './define';
export { INTL_LOCALE } from './format';

/**
 * A tiny typed i18n layer. Every feature declares a dictionary in `features/<feature>/i18n.ts`
 * with `defineDictionary`; `features/dictionaries.ts` merges them, and `t('<namespace>.<key>')`
 * only accepts keys that exist. Indonesian is the primary language.
 */

const TABLE: Record<Locale, Map<string, Message>> = { id: new Map(), en: new Map() };
for (const dictionary of DICTIONARIES) {
  for (const locale of LOCALES) {
    const messages = dictionary.messages[locale] as Record<string, Message>;
    for (const [key, message] of Object.entries(messages)) {
      TABLE[locale].set(`${dictionary.namespace}.${key}`, message);
    }
  }
}

/** English only when the browser prefers it; Indonesian otherwise (the primary audience). */
export const detectLocale = (): Locale => {
  if (typeof navigator === 'undefined') return 'id';
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of preferred) {
    const tag = language.toLowerCase();
    if (tag.startsWith('id') || tag.startsWith('ms')) return 'id';
    if (tag.startsWith('en')) return 'en';
  }
  return 'id';
};

const detected = detectLocale();

export const currentLocale = (): Locale => useUiStore.getState().locale ?? detected;

const interpolate = (template: string, params?: MessageParams): string =>
  params
    ? template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = params[name];
        return value === undefined || value === null ? match : String(value);
      })
    : template;

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const message = TABLE[locale].get(key) ?? TABLE.en.get(key);
  if (message === undefined) return key;
  if (typeof message === 'string') return interpolate(message, params);
  const count = Number(params?.count ?? 0);
  const category = count === 0 && message.zero ? 'zero' : pluralCategory(count, locale);
  return interpolate(message[category] ?? message.other, params);
}

/** Whether a key exists, for keys built at runtime (`errors.${code}`). */
export const hasMessage = (key: string): key is MessageKey => TABLE.en.has(key);

/** Translates outside React (toasts from non-component code). Prefer `useI18n().t` in components. */
export const t = (key: MessageKey, params?: MessageParams): string =>
  translate(currentLocale(), key, params);

export type Translate = (key: MessageKey, params?: MessageParams) => string;

/** Church settings that formatting follows. The church provider supplies them. */
export type FormatSettings = { timeZone?: string; currency: string };
export const FormatSettingsContext = createContext<FormatSettings>({ currency: 'IDR' });

export function useLocale(): Locale {
  return useUiStore((state) => state.locale) ?? detected;
}

/**
 * Translation and formatting bound to the active locale and, inside a church, to its time zone
 * and currency.
 */
export function useI18n() {
  const locale = useLocale();
  const setLocale = useUiStore((state) => state.setLocale);
  const settings = useContext(FormatSettingsContext);
  const tr = useCallback<Translate>((key, params) => translate(locale, key, params), [locale]);

  return useMemo(() => {
    const { timeZone, currency } = settings;
    return {
      locale,
      setLocale,
      timeZone,
      currency,
      t: tr,
      /** `preset` defaults to `date` ("Sun, 25 Oct"); see `DatePreset`. */
      formatDate: (
        value: string | Date | null | undefined,
        preset: DatePreset | DateFormatOptions = 'date',
      ) =>
        formatDate(
          value,
          locale,
          typeof preset === 'string' ? { preset, timeZone } : { timeZone, ...preset },
        ),
      formatDateTime: (value: string | Date | null | undefined) =>
        formatDate(value, locale, { preset: 'dateTime', timeZone }),
      formatTime: (value: string | Date | null | undefined) =>
        formatDate(value, locale, { preset: 'time', timeZone, fallback: '' }),
      formatDateRange: (
        start: string | null | undefined,
        end: string | null | undefined,
        allDay = false,
      ) =>
        formatDateRange(start, end, locale, {
          timeZone,
          allDay,
          allDayLabel: translate(locale, 'common.allDay'),
        }),
      formatRelative: (value: string | Date | null | undefined) => formatRelative(value, locale),
      formatNumber: (value: number | null | undefined, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, locale, options),
      formatPercent: (value: number | null | undefined, digits?: number) =>
        formatPercent(value, locale, digits),
      /** Integer minor units in the church currency (or `options.currency`). */
      formatCurrency: (
        minor: number | null | undefined,
        options: {
          currency?: string;
          compact?: boolean;
          signDisplay?: Intl.NumberFormatOptions['signDisplay'];
        } = {},
      ) =>
        formatCurrency(minor, options.currency ?? currency, locale, {
          compact: options.compact,
          signDisplay: options.signDisplay,
        }),
      formatList: (items: readonly string[]) => formatList(items, locale),
    };
  }, [locale, setLocale, settings, tr]);
}

export type I18n = ReturnType<typeof useI18n>;
