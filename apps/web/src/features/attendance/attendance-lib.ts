import { can, canViewAbsences, has, type Access, type AttendanceStatus } from '@tatagereja/shared';
import { CheckCircle2, CircleMinus, CircleSlash } from 'lucide-react';
import type { Tone } from '@/components/ui/tone';

/** The insights module tone, used by every attendance screen. */
export const ATTENDANCE_TONE = 'teal' satisfies Tone;

export const STATUS_TONES: Record<AttendanceStatus, Tone> = {
  present: 'success',
  absent: 'danger',
  excused: 'warning',
};

export const STATUS_ICONS = {
  present: CheckCircle2,
  absent: CircleSlash,
  excused: CircleMinus,
} as const;

/** Who may start a session anywhere: church-wide recorders and group leaders. */
export const canStartSession = (access: Access) =>
  has(access, 'attendance.record') || access.leaderGroupIds.length > 0;

/** Who sees the sessions list rather than only their own history. */
export const seesSessions = (access: Access) => can.viewAttendanceOverview(access);

export const seesAbsences = (access: Access) => canViewAbsences(access);
