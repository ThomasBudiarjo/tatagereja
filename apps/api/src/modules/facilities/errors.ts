import type { BookingConflict } from '@tatagereja/shared';
import { HttpError } from '../../lib/errors';

/**
 * 409 SCHEDULING_CONFLICT for bookings. The body also lists what overlaps (`conflicts`), so a
 * client can explain it; the message already does in plain words.
 */
export class BookingConflictError extends HttpError {
  readonly conflicts: BookingConflict[];

  constructor(message: string, conflicts: BookingConflict[]) {
    super(409, 'SCHEDULING_CONFLICT', message, [{ path: 'startsAt', message }]);
    this.name = 'BookingConflictError';
    this.conflicts = conflicts;
  }

  override toBody() {
    const body = super.toBody();
    return { error: { ...body.error, conflicts: this.conflicts } };
  }
}
