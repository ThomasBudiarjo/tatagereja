import type { Translate } from '@/lib/i18n';

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/Firefox\//, 'Firefox'],
  [/CriOS|Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/** "Chrome · Android" from a user agent, for session and sign-in lists. */
export function describeDevice(userAgent: string | null, t: Translate): string {
  if (!userAgent) return t('admin-security.unknownDevice');
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (!browser && !system) return userAgent.split(' ')[0] ?? t('admin-security.unknownDevice');
  return [browser, system].filter(Boolean).join(' · ');
}

/** Whether a user agent looks like a phone or tablet. */
export const isMobileDevice = (userAgent: string | null): boolean =>
  !!userAgent && /Android|iPhone|iPad|iPod|Mobile/.test(userAgent);
