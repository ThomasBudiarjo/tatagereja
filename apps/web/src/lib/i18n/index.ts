import { LOCALES, type Locale } from '@tatagereja/shared';
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { authDictionary } from '@/features/auth/i18n';
import type { MessageKey } from '@/features/dictionaries';
import { invitationsDictionary } from '@/features/invitations/i18n';
import { useUiStore } from '@/stores/ui';
import { commonDictionary } from './common';
import type { Dictionary, Message, MessageParams } from './define';
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
 *
 * The first download only carries the dictionaries of the signed-out screens (common, sign-in,
 * invitations). Every other message comes in one chunk per language
 * (`virtual:locale-messages/<locale>`, built from `features/dictionaries.ts`) with the first
 * signed-in screen: `lazyPage` awaits `loadDictionaries`, and the sign-in page fetches it in
 * idle time.
 */

const TABLE: Record<Locale, Map<string, Message>> = { id: new Map(), en: new Map() };
for (const dictionary of [
  commonDictionary,
  authDictionary,
  invitationsDictionary,
] as Dictionary[]) {
  for (const locale of LOCALES) {
    const messages = dictionary.messages[locale] as Record<string, Message>;
    for (const [key, message] of Object.entries(messages)) {
      TABLE[locale].set(`${dictionary.namespace}.${key}`, message);
    }
  }
}

const MESSAGES: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  id: () => import('virtual:locale-messages/id'),
  en: () => import('virtual:locale-messages/en'),
};
const loading: Partial<Record<Locale, Promise<void>>> = {};
const loadedLocales = new Set<Locale>();
let version = 0;
const listeners = new Set<() => void>();

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

/**
 * Loads every message of a language (the active one by default); screens re-render in place
 * when it arrives. Safe to call often: each language downloads once.
 */
export function loadDictionaries(locale: Locale = currentLocale()): Promise<void> {
  loading[locale] ??= MESSAGES[locale]().then(
    ({ default: messages }) => {
      for (const [key, message] of Object.entries(messages)) {
        TABLE[locale].set(key, message as Message);
      }
      loadedLocales.add(locale);
      version += 1;
      for (const listener of listeners) listener();
    },
    (error: unknown) => {
      // A failed download (offline) is retried by the next call.
      delete loading[locale];
      throw error;
    },
  );
  return loading[locale];
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const useDictionaryVersion = () =>
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );

const interpolate = (template: string, params?: MessageParams): string =>
  params
    ? template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = params[name];
        return value === undefined || value === null ? match : String(value);
      })
    : template;

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  let message = TABLE[locale].get(key);
  if (message === undefined) {
    // A feature message before its language arrived (a screen outside the lazy routes, or
    // just after switching language): fetch it, show the other language meanwhile.
    if (!loadedLocales.has(locale)) void loadDictionaries(locale).catch(() => undefined);
    message = TABLE.en.get(key) ?? TABLE.id.get(key);
  }
  if (message === undefined) return key;
  if (typeof message === 'string') return interpolate(message, params);
  const count = Number(params?.count ?? 0);
  const category = count === 0 && message.zero ? 'zero' : pluralCategory(count, locale);
  return interpolate(message[category] ?? message.other, params);
}

/** Whether a key exists, for keys built at runtime (`errors.${code}`). */
export const hasMessage = (key: string): key is MessageKey =>
  TABLE.en.has(key) || TABLE.id.has(key);

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
  const version = useDictionaryVersion();
  const tr = useCallback<Translate>(
    (key, params) => translate(locale, key, params),
    // `version` changes when a language's messages arrive, so screens translate again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, version],
  );

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
