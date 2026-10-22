export const LOCALES = ['id', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** A short text in every supported interface language. Indonesian is the primary audience. */
export type LocalizedText = Readonly<Record<Locale, string>>;

export const localize = (text: LocalizedText, locale: Locale): string => text[locale] ?? text.en;
