/** Query key factory scoped per church so switching churches never reuses cached data. */
export const churchScope = (churchId: string) => ['church', churchId] as const;

export const keys = {
  dashboard: (churchId: string) => [...churchScope(churchId), 'dashboard'] as const,
  people: (churchId: string) => [...churchScope(churchId), 'people'] as const,
  peopleList: (churchId: string, params: Record<string, unknown>) =>
    [...churchScope(churchId), 'people', 'list', params] as const,
  person: (churchId: string, id: string) =>
    [...churchScope(churchId), 'people', 'detail', id] as const,
  personAttendance: (churchId: string, id: string) =>
    [...churchScope(churchId), 'people', 'attendance', id] as const,
  groups: (churchId: string) => [...churchScope(churchId), 'groups'] as const,
  groupList: (churchId: string, params: Record<string, unknown>) =>
    [...churchScope(churchId), 'groups', 'list', params] as const,
  group: (churchId: string, id: string) =>
    [...churchScope(churchId), 'groups', 'detail', id] as const,
  events: (churchId: string) => [...churchScope(churchId), 'events'] as const,
  eventList: (churchId: string, params: Record<string, unknown>) =>
    [...churchScope(churchId), 'events', 'list', params] as const,
  event: (churchId: string, id: string) =>
    [...churchScope(churchId), 'events', 'detail', id] as const,
  attendance: (churchId: string) => [...churchScope(churchId), 'attendance'] as const,
  attendanceList: (churchId: string, params: Record<string, unknown>) =>
    [...churchScope(churchId), 'attendance', 'list', params] as const,
  attendanceSession: (churchId: string, id: string) =>
    [...churchScope(churchId), 'attendance', 'detail', id] as const,
  myAttendance: (churchId: string) => [...churchScope(churchId), 'attendance', 'me'] as const,
  announcements: (churchId: string) => [...churchScope(churchId), 'announcements'] as const,
  announcementList: (churchId: string, params: Record<string, unknown>) =>
    [...churchScope(churchId), 'announcements', 'list', params] as const,
  announcement: (churchId: string, id: string) =>
    [...churchScope(churchId), 'announcements', 'detail', id] as const,
};
