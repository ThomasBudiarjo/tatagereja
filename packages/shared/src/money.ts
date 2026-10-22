/**
 * Money is stored as an integer number of minor units in the church currency.
 * The rupiah has no minor unit in practice, so one IDR minor unit is one rupiah and
 * amounts are shown without decimals; USD stores cents, and so on.
 */
export const CURRENCIES = {
  IDR: { digits: 0, locale: 'id-ID' },
  USD: { digits: 2, locale: 'en-US' },
  SGD: { digits: 2, locale: 'en-SG' },
  MYR: { digits: 2, locale: 'ms-MY' },
  AUD: { digits: 2, locale: 'en-AU' },
  NZD: { digits: 2, locale: 'en-NZ' },
  EUR: { digits: 2, locale: 'de-DE' },
  GBP: { digits: 2, locale: 'en-GB' },
  PHP: { digits: 2, locale: 'en-PH' },
  THB: { digits: 2, locale: 'th-TH' },
  HKD: { digits: 2, locale: 'zh-HK' },
  TWD: { digits: 0, locale: 'zh-TW' },
  KRW: { digits: 0, locale: 'ko-KR' },
  JPY: { digits: 0, locale: 'ja-JP' },
  CNY: { digits: 2, locale: 'zh-CN' },
  INR: { digits: 2, locale: 'en-IN' },
  CAD: { digits: 2, locale: 'en-CA' },
} as const;
export type CurrencyCode = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];
export const DEFAULT_CURRENCY: CurrencyCode = 'IDR';

export const isCurrencyCode = (value: unknown): value is CurrencyCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(CURRENCIES, value);

const currencyOf = (code: string) => (isCurrencyCode(code) ? CURRENCIES[code] : CURRENCIES.IDR);

export const currencyMinorDigits = (code: string): number => currencyOf(code).digits;

/** Converts a human amount (e.g. 12.5 USD) to integer minor units (1250). */
export const toMinorUnits = (amount: number, currency: string): number =>
  Math.round(amount * 10 ** currencyMinorDigits(currency));

/** Converts integer minor units back to a human amount. */
export const fromMinorUnits = (minor: number, currency: string): number =>
  minor / 10 ** currencyMinorDigits(currency);

/** Formats minor units for display, e.g. `formatMoney(150000, 'IDR')` → "Rp 150.000". */
export const formatMoney = (minor: number, currency: string, locale?: string): string => {
  const { digits, locale: defaultLocale } = currencyOf(currency);
  return new Intl.NumberFormat(locale ?? defaultLocale, {
    style: 'currency',
    currency: isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
};

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

/** Time zones offered first in pickers: WIB, WITA and WIT. */
export const INDONESIAN_TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const;

export const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
