/**
 * Accent tones (see `[data-tone]` in index.css). Module tones colour a module's icon, tiles and
 * page header; status tones colour badges and alerts.
 */
export const MODULE_TONES = [
  'brand',
  'slate',
  'sky',
  'amber',
  'teal',
  'violet',
  'rose',
  'indigo',
  'emerald',
  'olive',
  'sun',
] as const;
export const STATUS_TONES = ['neutral', 'success', 'warning', 'danger', 'info'] as const;

export type ModuleTone = (typeof MODULE_TONES)[number];
export type StatusTone = (typeof STATUS_TONES)[number];
export type Tone = ModuleTone | StatusTone;

/** Picks a stable tone for a name (group colours, tags). */
export const toneFor = (name: string): ModuleTone => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const tones = MODULE_TONES.filter((tone) => tone !== 'brand');
  return tones[hash % tones.length] ?? 'sky';
};
