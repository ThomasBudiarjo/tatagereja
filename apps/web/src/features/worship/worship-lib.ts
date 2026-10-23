import {
  LITURGY_ITEM_TYPE_LABELS,
  fullName,
  localize,
  type LiturgyItemType,
  type RosterStatus,
  type ServiceStatus,
  type Song,
  type WorshipService,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CircleDot, HandCoins, HandHeart, Megaphone, Mic, Music } from 'lucide-react';
import type { ComponentType } from 'react';
import type { FieldValues, Path, Resolver } from 'react-hook-form';
import { useChurch } from '@/components/layout/church-provider';
import type { Tone } from '@/components/ui/tone';
import { useI18n } from '@/lib/i18n';
import { worshipMeQuery } from './api';

/* Constants, helpers and hooks shared by the worship screens (components live in worship-ui). */

/** The module accent (also set in `module.tsx`). */
export const WORSHIP_TONE = 'violet' satisfies Tone;

export const SERVICE_STATUS_TONES: Record<ServiceStatus, Tone> = {
  draft: 'neutral',
  published: 'success',
  cancelled: 'danger',
};

export const ROSTER_STATUS_TONES: Record<RosterStatus, Tone> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'danger',
};

export const LITURGY_TYPE_STYLE: Record<
  LiturgyItemType,
  { icon: ComponentType<{ className?: string }>; tone: Tone }
> = {
  song: { icon: Music, tone: 'violet' },
  reading: { icon: BookOpen, tone: 'sky' },
  prayer: { icon: HandHeart, tone: 'teal' },
  sermon: { icon: Mic, tone: 'amber' },
  offering: { icon: HandCoins, tone: 'emerald' },
  announcement: { icon: Megaphone, tone: 'rose' },
  other: { icon: CircleDot, tone: 'slate' },
};

/** "KJ 392" for hymns; null for songs outside a hymnal. */
export const hymnalLabel = (song: Pick<Song, 'hymnal' | 'hymnalNumber'>): string | null =>
  song.hymnal && song.hymnal !== 'other'
    ? `${song.hymnal}${song.hymnalNumber ? ` ${song.hymnalNumber}` : ''}`
    : song.hymnalNumber
      ? `#${song.hymnalNumber}`
      : null;

/** "1 h 15 min" or "45 min". */
export function useDuration() {
  const { t } = useI18n();
  return (minutes: number) =>
    minutes >= 60
      ? t('worship.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
      : t('worship.minutes', { count: minutes });
}

export const preacherOf = (service: Pick<WorshipService, 'preacher' | 'preacherName'>) =>
  service.preacher ? fullName(service.preacher) : service.preacherName;

/** The caller's worship context (person, led teams, pending replies). */
export function useWorshipMe() {
  const { churchId } = useChurch();
  return useQuery(worshipMeQuery(churchId));
}

/** Localised liturgy type name. */
export function useLiturgyTypeLabel() {
  const { locale } = useI18n();
  return (type: LiturgyItemType) => localize(LITURGY_ITEM_TYPE_LABELS[type], locale);
}

/** Team colours that read well in both themes. */
export const TEAM_COLORS = [
  '#7c3aed',
  '#2563eb',
  '#0891b2',
  '#059669',
  '#ca8a04',
  '#ea580c',
  '#db2777',
  '#64748b',
] as const;

/** The start time of every liturgy item, from the service start and the durations before it. */
export const liturgySchedule = <T extends { durationMinutes: number | null }>(
  startsAt: string,
  items: readonly T[],
): { item: T; at: Date }[] => {
  const start = new Date(startsAt).getTime();
  return items.reduce<{ list: { item: T; at: Date }[]; minutes: number }>(
    (acc, item) => ({
      list: [...acc.list, { item, at: new Date(start + acc.minutes * 60_000) }],
      minutes: acc.minutes + (item.durationMinutes ?? 0),
    }),
    { list: [], minutes: 0 },
  ).list;
};

/**
 * Translates the messages of the shared schemas' own rules (`refine`), which are English on
 * both sides; built-in zod messages already follow the interface language.
 */
export const withMessages =
  <V extends FieldValues, C, O>(
    resolver: Resolver<V, C, O>,
    messages: Partial<Record<Path<V>, () => string>>,
  ): Resolver<V, C, O> =>
  async (values, context, options) => {
    const result = await resolver(values, context, options);
    const errors = result.errors as Record<string, { type?: string; message?: string } | undefined>;
    for (const [path, message] of Object.entries(messages) as [string, () => string][]) {
      const error = errors[path];
      if (error && error.type === 'custom') error.message = message();
    }
    return result;
  };
