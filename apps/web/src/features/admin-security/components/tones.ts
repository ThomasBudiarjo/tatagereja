import type { ChurchRole } from '@tatagereja/shared';
import type { Tone } from '@/components/ui/tone';

/** Colour of each base role wherever it is shown. */
export const ROLE_TONES: Record<ChurchRole, Tone> = {
  owner: 'brand',
  administrator: 'indigo',
  member: 'neutral',
};
