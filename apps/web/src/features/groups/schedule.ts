import {
  MEETING_FREQUENCY_LABELS,
  WEEKDAY_TEXT,
  localize,
  type GroupSchedule,
  type Locale,
} from '@tatagereja/shared';

/** "Setiap minggu · Sabtu, 16.00": the structured schedule, or the older free text. */
export function scheduleText(
  group: Pick<GroupSchedule, 'meetingDay' | 'meetingTime' | 'meetingFrequency'> & {
    meetingSchedule?: string | null;
  },
  locale: Locale,
): string | null {
  const parts: string[] = [];
  if (group.meetingFrequency && group.meetingFrequency !== 'irregular') {
    parts.push(localize(MEETING_FREQUENCY_LABELS[group.meetingFrequency], locale));
  }
  const day = group.meetingDay !== null ? WEEKDAY_TEXT[group.meetingDay] : undefined;
  const time = group.meetingTime
    ? group.meetingTime.replace(':', locale === 'id' ? '.' : ':')
    : null;
  const when = [day ? localize(day, locale) : null, time].filter(Boolean).join(', ');
  if (when) parts.push(when);
  if (parts.length === 0 && group.meetingFrequency === 'irregular') {
    parts.push(localize(MEETING_FREQUENCY_LABELS.irregular, locale));
  }
  return parts.length > 0 ? parts.join(' · ') : (group.meetingSchedule ?? null);
}
