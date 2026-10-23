import {
  ATTENDANCE_STATUS_TEXT,
  can,
  canViewAbsences,
  has,
  localize,
  type Access,
  type AttendanceStatus,
} from '@tatagereja/shared';
import { CheckCircle2, CircleMinus, CircleSlash } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import type { Tone } from '@/components/ui/tone';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

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

export function AttendanceStatusBadge({
  status,
  size = 'md',
}: {
  status: AttendanceStatus;
  size?: 'sm' | 'md';
}) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={STATUS_TONES[status]} icon={STATUS_ICONS[status]} size={size}>
      {localize(ATTENDANCE_STATUS_TEXT[status], locale)}
    </StatusBadge>
  );
}

/** The day of a session as a small calendar chip. */
export function DateChip({ value, tone = ATTENDANCE_TONE }: { value: string; tone?: Tone }) {
  const { formatDate } = useI18n();
  return (
    <span
      data-tone={tone}
      className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-tone-soft text-tone-ink"
      aria-hidden
    >
      <span className="text-[10px] leading-none font-semibold uppercase">
        {formatDate(value, { options: { month: 'short' } })}
      </span>
      <span className="text-base leading-tight font-bold tabular">
        {formatDate(value, { options: { day: 'numeric' } })}
      </span>
    </span>
  );
}

/** A thin bar of present / absent / excused shares. Decorative: numbers are shown next to it. */
export function MarkBar({
  present,
  absent,
  excused,
  total,
  className,
}: {
  present: number;
  absent: number;
  excused: number;
  total: number;
  className?: string;
}) {
  const share = (value: number) => `${total === 0 ? 0 : (value / total) * 100}%`;
  return (
    <div
      aria-hidden
      className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <span
        data-tone="success"
        className="bg-tone transition-[width]"
        style={{ width: share(present) }}
      />
      <span
        data-tone="warning"
        className="bg-tone transition-[width]"
        style={{ width: share(excused) }}
      />
      <span
        data-tone="danger"
        className="bg-tone transition-[width]"
        style={{ width: share(absent) }}
      />
    </div>
  );
}
