import type { EventDetails } from '@tatagereja/shared';
import type { ModuleTone, Tone } from '@/components/ui/tone';
import type { MessageKey } from '@/lib/i18n';

export const EVENT_TONE: ModuleTone = 'sky';

/** Maps opens the location in the person's own map app. */
export const mapsUrl = (location: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

/** The registration state shown on cards: open, few places, full, waitlist, closed. */
export function registrationBadge(
  event: Pick<
    EventDetails,
    'registrationRequired' | 'capacity' | 'placesLeft' | 'waitlistEnabled' | 'cancelledAt'
  >,
): { key: MessageKey; tone: Tone; params?: Record<string, number> } | null {
  if (!event.registrationRequired || event.cancelledAt) return null;
  if (event.capacity === null || event.placesLeft === null) {
    return { key: 'events.registrationOpen', tone: 'success' };
  }
  if (event.placesLeft === 0) {
    return event.waitlistEnabled
      ? { key: 'events.fullWaitlist', tone: 'warning' }
      : { key: 'events.full', tone: 'danger' };
  }
  if (event.placesLeft <= Math.max(3, Math.ceil(event.capacity * 0.1))) {
    return { key: 'events.placesLeft', tone: 'warning', params: { count: event.placesLeft } };
  }
  return { key: 'events.placesLeft', tone: 'success', params: { count: event.placesLeft } };
}

/** Preset accent colours for an event (shown in the calendar). */
export const EVENT_COLORS = [
  '#2563eb',
  '#0d9488',
  '#16a34a',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#db2777',
  '#7c3aed',
] as const;
