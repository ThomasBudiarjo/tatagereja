import type { Locale } from '@tatagereja/shared';

/**
 * A message is a string with `{name}` placeholders, or plural forms selected by the `count`
 * parameter with `Intl.PluralRules` (`{ one: '{count} person', other: '{count} people' }`).
 * Indonesian has no grammatical plural, so its messages are usually plain strings.
 */
export type PluralMessage = {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
};
export type Message = string | PluralMessage;
export type Messages = Record<string, Message>;

export type Dictionary<NS extends string = string, M extends Messages = Messages> = {
  namespace: NS;
  messages: Record<Locale, Record<keyof M, Message>>;
};

/**
 * Declares a feature's dictionary. English defines the keys; Indonesian must translate every
 * one of them (the compiler reports a missing or extra key). Keys are used as
 * `t('<namespace>.<key>')`.
 *
 * ```ts
 * export const financeDictionary = defineDictionary('finance', {
 *   en: { title: 'Finance', entries: { one: '{count} entry', other: '{count} entries' } },
 *   id: { title: 'Keuangan', entries: '{count} transaksi' },
 * });
 * ```
 */
export function defineDictionary<NS extends string, M extends Messages>(
  namespace: NS,
  messages: { en: M; id: { [K in keyof M]: Message } },
): Dictionary<NS, M> {
  return { namespace, messages };
}

/** Every `<namespace>.<key>` of a dictionary. */
export type DictionaryKeys<D> =
  D extends Dictionary<infer NS, infer M> ? `${NS}.${Extract<keyof M, string>}` : never;

export type MessageParams = Record<string, string | number | null | undefined>;
