import type {
  LiturgyItem,
  PersonSummary,
  ServiceType,
  ServingPosition,
  ServingTeam,
  Song,
  VolunteerBlockout,
  WorshipService,
} from '@tatagereja/shared';
import type {
  LiturgyItemRow,
  ServiceTypeRow,
  ServingPositionRow,
  ServingTeamRow,
  SongRow,
  VolunteerBlockoutRow,
  WorshipServiceRow,
} from '../../db/schema';

export const toServiceType = (row: ServiceTypeRow): ServiceType => ({
  id: row.id,
  name: row.name,
  category: row.category,
  defaultTime: row.defaultTime,
  defaultDurationMinutes: row.defaultDurationMinutes,
  defaultLocation: row.defaultLocation,
  color: row.color,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
});

export const toWorshipService = (
  row: WorshipServiceRow,
  extras: {
    serviceTypeName: string | null;
    preacher: PersonSummary | null;
    totalMinutes: number;
    rosterAccepted: number;
    rosterTotal: number;
  },
): WorshipService => ({
  id: row.id,
  churchId: row.churchId,
  serviceTypeId: row.serviceTypeId,
  serviceTypeName: extras.serviceTypeName,
  title: row.title,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  location: row.location,
  theme: row.theme,
  scriptureReadings: Array.isArray(row.scriptureReadings) ? row.scriptureReadings : [],
  preacher: extras.preacher,
  preacherName: row.preacherName,
  notes: row.notes,
  status: row.status,
  totalMinutes: extras.totalMinutes,
  rosterAccepted: extras.rosterAccepted,
  rosterTotal: extras.rosterTotal,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toLiturgyItem = (
  row: LiturgyItemRow,
  songTitle: string | null,
  person: PersonSummary | null,
): LiturgyItem => ({
  id: row.id,
  serviceId: row.serviceId,
  position: row.position,
  type: row.type,
  title: row.title,
  durationMinutes: row.durationMinutes,
  songId: row.songId,
  songTitle,
  songKey: row.songKey,
  person,
  personName: row.personName,
  notes: row.notes,
});

export const toSong = (
  row: SongRow,
  usage: { lastUsedAt: string | null; useCount: number } = { lastUsedAt: null, useCount: 0 },
): Song => ({
  id: row.id,
  title: row.title,
  author: row.author,
  defaultKey: row.defaultKey,
  tempo: row.tempo,
  lyrics: row.lyrics,
  tags: Array.isArray(row.tags) ? row.tags : [],
  ccliNumber: row.ccliNumber,
  hymnal: row.hymnal,
  hymnalNumber: row.hymnalNumber,
  notes: row.notes,
  isActive: row.isActive,
  lastUsedAt: usage.lastUsedAt,
  useCount: usage.useCount,
});

export const toServingPosition = (row: ServingPositionRow): ServingPosition => ({
  id: row.id,
  teamId: row.teamId,
  name: row.name,
  description: row.description,
  needed: row.needed,
  sortOrder: row.sortOrder,
});

export const toServingTeam = (
  row: ServingTeamRow,
  positions: ServingPositionRow[],
  memberCount: number,
): ServingTeam => ({
  id: row.id,
  name: row.name,
  description: row.description,
  color: row.color,
  groupId: row.groupId,
  isActive: row.isActive,
  positions: positions.map(toServingPosition),
  memberCount,
});

export const toVolunteerBlockout = (
  row: VolunteerBlockoutRow,
  person: PersonSummary,
): VolunteerBlockout => ({
  id: row.id,
  personId: row.personId,
  person,
  startDate: row.startDate,
  endDate: row.endDate,
  reason: row.reason,
  createdAt: row.createdAt,
});
