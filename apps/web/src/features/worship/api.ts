import {
  liturgyResponseSchema,
  myScheduleSchema,
  okSchema,
  rosterAssignmentResponseSchema,
  rosterAssignBodySchema,
  rosterAssignResultSchema,
  rosterCheckBodySchema,
  rosterCheckResultSchema,
  rosterSuggestionsSchema,
  saveLiturgyBodySchema,
  serviceTypeInputSchema,
  serviceTypeListSchema,
  serviceTypeResponseSchema,
  servingPositionInputSchema,
  servingPositionResponseSchema,
  servingTeamDetailSchema,
  servingTeamInputSchema,
  servingTeamListSchema,
  servingTeamMemberInputSchema,
  servingTeamMemberResponseSchema,
  servingTeamMemberUpdateSchema,
  servingTeamResponseSchema,
  songDetailSchema,
  songInputSchema,
  songListSchema,
  songResponseSchema,
  songTagsSchema,
  volunteerBlockoutInputSchema,
  volunteerBlockoutListSchema,
  volunteerBlockoutResponseSchema,
  worshipMeSchema,
  worshipOverviewSchema,
  worshipPeopleSchema,
  worshipServiceDetailSchema,
  worshipServiceInputSchema,
  worshipServiceListSchema,
  worshipServiceResponseSchema,
  worshipSetupResultSchema,
  type MySchedule,
  type MyScheduleQuery,
  type RosterRespondBody,
  type SongListQuery,
  type VolunteerBlockoutListQuery,
  type WorshipOverview,
  type WorshipServiceDetail,
  type WorshipServiceListQuery,
} from '@tatagereja/shared';
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { z } from 'zod';
import { request } from '@/lib/api';
import { churchScope, keys } from '@/lib/keys';
import { optimistic } from '@/lib/use-mutation-toast';

/** Query keys of the worship module, all below `['church', id, 'worship']`. */
export const worshipKeys = {
  all: (churchId: string) => [...churchScope(churchId), 'worship'] as const,
  me: (churchId: string) => [...worshipKeys.all(churchId), 'me'] as const,
  overview: (churchId: string) => [...worshipKeys.all(churchId), 'overview'] as const,
  serviceTypes: (churchId: string) => [...worshipKeys.all(churchId), 'service-types'] as const,
  services: (churchId: string) => [...worshipKeys.all(churchId), 'services'] as const,
  serviceList: (churchId: string, params: Record<string, unknown>) =>
    [...worshipKeys.services(churchId), 'list', params] as const,
  service: (churchId: string, id: string) =>
    [...worshipKeys.services(churchId), 'detail', id] as const,
  suggestions: (churchId: string, serviceId: string, positionId: string) =>
    [...worshipKeys.services(churchId), 'suggestions', serviceId, positionId] as const,
  songs: (churchId: string) => [...worshipKeys.all(churchId), 'songs'] as const,
  songList: (churchId: string, params: Record<string, unknown>) =>
    [...worshipKeys.songs(churchId), 'list', params] as const,
  song: (churchId: string, id: string) => [...worshipKeys.songs(churchId), 'detail', id] as const,
  songTags: (churchId: string) => [...worshipKeys.songs(churchId), 'tags'] as const,
  teams: (churchId: string) => [...worshipKeys.all(churchId), 'teams'] as const,
  team: (churchId: string, id: string) => [...worshipKeys.teams(churchId), 'detail', id] as const,
  schedule: (churchId: string, scope: string) =>
    [...worshipKeys.all(churchId), 'schedule', scope] as const,
  blockouts: (churchId: string, params: Record<string, unknown>) =>
    [...worshipKeys.all(churchId), 'blockouts', params] as const,
  people: (churchId: string, q: string) => [...worshipKeys.all(churchId), 'people', q] as const,
};

/**
 * Worship data is closely linked (a roster change moves the overview, my schedule, the
 * service list counts and the team pages), so writes refresh the whole module and the home
 * dashboard. Only mounted queries refetch.
 */
export const invalidateWorship = (client: QueryClient, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: worshipKeys.all(churchId) }),
    client.invalidateQueries({ queryKey: keys.dashboard(churchId) }),
  ]);

const at = (churchId: string, path = '') => `/churches/${churchId}/worship${path}`;

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export const worshipMeQuery = (churchId: string) =>
  queryOptions({
    queryKey: worshipKeys.me(churchId),
    queryFn: () => request(worshipMeSchema, { url: at(churchId, '/me') }),
    staleTime: 60_000,
  });

export const overviewQuery = (churchId: string) =>
  queryOptions({
    queryKey: worshipKeys.overview(churchId),
    queryFn: () => request(worshipOverviewSchema, { url: at(churchId, '/overview') }),
  });

export const serviceTypesQuery = (churchId: string) =>
  queryOptions({
    queryKey: worshipKeys.serviceTypes(churchId),
    queryFn: () => request(serviceTypeListSchema, { url: at(churchId, '/service-types') }),
    staleTime: 5 * 60_000,
  });

export type ServiceListParams = Partial<WorshipServiceListQuery>;

export const servicesQuery = (churchId: string, params: ServiceListParams = {}) =>
  queryOptions({
    queryKey: worshipKeys.serviceList(churchId, params),
    queryFn: () => request(worshipServiceListSchema, { url: at(churchId, '/services'), params }),
    placeholderData: keepPreviousData,
  });

export const serviceQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: worshipKeys.service(churchId, id),
    queryFn: () => request(worshipServiceDetailSchema, { url: at(churchId, `/services/${id}`) }),
  });

export const suggestionsQuery = (churchId: string, serviceId: string, positionId: string) =>
  queryOptions({
    queryKey: worshipKeys.suggestions(churchId, serviceId, positionId),
    queryFn: () =>
      request(rosterSuggestionsSchema, {
        url: at(churchId, `/services/${serviceId}/roster/suggestions`),
        params: { positionId },
      }),
  });

export type SongListParams = Partial<SongListQuery>;

export const songsQuery = (churchId: string, params: SongListParams = {}) =>
  queryOptions({
    queryKey: worshipKeys.songList(churchId, params),
    queryFn: () => request(songListSchema, { url: at(churchId, '/songs'), params }),
    placeholderData: keepPreviousData,
  });

export const songQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: worshipKeys.song(churchId, id),
    queryFn: () => request(songDetailSchema, { url: at(churchId, `/songs/${id}`) }),
  });

export const songTagsQuery = (churchId: string) =>
  queryOptions({
    queryKey: worshipKeys.songTags(churchId),
    queryFn: () => request(songTagsSchema, { url: at(churchId, '/songs/tags') }),
  });

export const teamsQuery = (churchId: string) =>
  queryOptions({
    queryKey: worshipKeys.teams(churchId),
    queryFn: () => request(servingTeamListSchema, { url: at(churchId, '/teams') }),
  });

export const teamQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: worshipKeys.team(churchId, id),
    queryFn: () => request(servingTeamDetailSchema, { url: at(churchId, `/teams/${id}`) }),
  });

export const myScheduleQuery = (churchId: string, scope: MyScheduleQuery['scope'] = 'upcoming') =>
  queryOptions({
    queryKey: worshipKeys.schedule(churchId, scope),
    queryFn: () =>
      request(myScheduleSchema, { url: at(churchId, '/me/schedule'), params: { scope } }),
  });

export const blockoutsQuery = (
  churchId: string,
  params: Partial<VolunteerBlockoutListQuery> = {},
) =>
  queryOptions({
    queryKey: worshipKeys.blockouts(churchId, params),
    queryFn: () =>
      request(volunteerBlockoutListSchema, { url: at(churchId, '/blockouts'), params }),
  });

export const worshipPeopleQuery = (churchId: string, q: string) =>
  queryOptions({
    queryKey: worshipKeys.people(churchId, q),
    queryFn: () =>
      request(worshipPeopleSchema, {
        url: at(churchId, '/people'),
        params: { q: q || undefined, limit: 30 },
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

// ---------------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------------

/** An answer to an assignment; `serviceId` names the service page to update at once. */
export type RespondVariables = RosterRespondBody & { id: string; serviceId: string };

/** A mutation that refreshes the worship module when it succeeds. */
function useWorshipMutation<TVariables, TData>(
  churchId: string,
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => invalidateWorship(client, churchId),
  });
}

export const useSetupWorship = (churchId: string) =>
  useWorshipMutation(churchId, () =>
    request(worshipSetupResultSchema, { method: 'POST', url: at(churchId, '/setup') }),
  );

export const useSaveServiceType = (churchId: string) =>
  useWorshipMutation(
    churchId,
    ({ id, ...body }: z.input<typeof serviceTypeInputSchema> & { id?: string }) =>
      request(serviceTypeResponseSchema, {
        method: id ? 'PATCH' : 'POST',
        url: at(churchId, id ? `/service-types/${id}` : '/service-types'),
        data: serviceTypeInputSchema.parse(body),
      }),
  );

export const useDeleteServiceType = (churchId: string) =>
  useWorshipMutation(churchId, (id: string) =>
    request(okSchema, { method: 'DELETE', url: at(churchId, `/service-types/${id}`) }),
  );

export const useSaveService = (churchId: string, id?: string) =>
  useWorshipMutation(churchId, (body: z.input<typeof worshipServiceInputSchema>) =>
    request(worshipServiceResponseSchema, {
      method: id ? 'PATCH' : 'POST',
      url: at(churchId, id ? `/services/${id}` : '/services'),
      data: worshipServiceInputSchema.parse(body),
    }),
  );

export function useDeleteService(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { method: 'DELETE', url: at(churchId, `/services/${id}`) }),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: worshipKeys.service(churchId, id) });
      return invalidateWorship(client, churchId);
    },
  });
}

export const useSaveLiturgy = (churchId: string, serviceId: string) =>
  useWorshipMutation(churchId, (body: z.input<typeof saveLiturgyBodySchema>) =>
    request(liturgyResponseSchema, {
      method: 'PUT',
      url: at(churchId, `/services/${serviceId}/liturgy`),
      data: saveLiturgyBodySchema.parse(body),
    }),
  );

export const useAssignRoster = (churchId: string, serviceId: string) =>
  useWorshipMutation(churchId, (body: z.input<typeof rosterAssignBodySchema>) =>
    request(rosterAssignResultSchema, {
      method: 'POST',
      url: at(churchId, `/services/${serviceId}/roster`),
      data: rosterAssignBodySchema.parse(body),
    }),
  );

/** The conflicts planned assignments would have, to explain a 409 SCHEDULING_CONFLICT. */
export const checkRoster = (
  churchId: string,
  serviceId: string,
  body: z.input<typeof rosterCheckBodySchema>,
) =>
  request(rosterCheckResultSchema, {
    method: 'POST',
    url: at(churchId, `/services/${serviceId}/roster/check`),
    data: rosterCheckBodySchema.parse(body),
  });

export const useAutoFillRoster = (churchId: string, serviceId: string) =>
  useWorshipMutation(churchId, (body: { teamId?: string }) =>
    request(rosterAssignResultSchema, {
      method: 'POST',
      url: at(churchId, `/services/${serviceId}/roster/auto-fill`),
      data: body,
    }),
  );

export const useCopyRoster = (churchId: string, serviceId: string) =>
  useWorshipMutation(churchId, (body: { fromServiceId?: string }) =>
    request(rosterAssignResultSchema, {
      method: 'POST',
      url: at(churchId, `/services/${serviceId}/roster/copy`),
      data: body,
    }),
  );

export const useRemoveAssignment = (churchId: string) =>
  useWorshipMutation(churchId, (id: string) =>
    request(okSchema, { method: 'DELETE', url: at(churchId, `/roster/${id}`) }),
  );

/**
 * Accepting or declining shows at once in "My schedule", the module home and on the service;
 * the server answer (with fresh conflicts) replaces it, and a failure puts the old status back.
 */
export function useRespondToAssignment(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: RespondVariables) =>
      request(rosterAssignmentResponseSchema, {
        method: 'POST',
        url: at(churchId, `/roster/${id}/respond`),
        data: { status, reason },
      }),
    onMutate: async ({ id, serviceId, status, reason }) => {
      const answer = <T extends { id: string; status: string; declineReason: string | null }>(
        items: T[],
      ): T[] =>
        items.map((item) =>
          item.id === id
            ? { ...item, status, declineReason: status === 'declined' ? (reason ?? null) : null }
            : item,
        );
      const rollbacks = await Promise.all([
        optimistic<MySchedule>(
          client,
          worshipKeys.schedule(churchId, 'upcoming'),
          (old) => old && { items: answer(old.items) },
        ),
        optimistic<WorshipOverview>(
          client,
          worshipKeys.overview(churchId),
          (old) => old && { ...old, mySchedule: answer(old.mySchedule) },
        ),
        optimistic<WorshipServiceDetail>(
          client,
          worshipKeys.service(churchId, serviceId),
          (old) => old && { ...old, roster: answer(old.roster) },
        ),
      ]);
      return { rollback: () => rollbacks.forEach((rollback) => rollback()) };
    },
    onError: (_error, _variables, context) => context?.rollback(),
    onSettled: () => invalidateWorship(client, churchId),
  });
}

export const useSaveSong = (churchId: string, id?: string) =>
  useWorshipMutation(churchId, (body: z.input<typeof songInputSchema>) =>
    request(songResponseSchema, {
      method: id ? 'PATCH' : 'POST',
      url: at(churchId, id ? `/songs/${id}` : '/songs'),
      data: songInputSchema.parse(body),
    }),
  );

export function useDeleteSong(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { method: 'DELETE', url: at(churchId, `/songs/${id}`) }),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: worshipKeys.song(churchId, id) });
      return invalidateWorship(client, churchId);
    },
  });
}

export const useSaveTeam = (churchId: string, id?: string) =>
  useWorshipMutation(churchId, (body: z.input<typeof servingTeamInputSchema>) =>
    request(servingTeamResponseSchema, {
      method: id ? 'PATCH' : 'POST',
      url: at(churchId, id ? `/teams/${id}` : '/teams'),
      data: servingTeamInputSchema.parse(body),
    }),
  );

export function useDeleteTeam(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { method: 'DELETE', url: at(churchId, `/teams/${id}`) }),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: worshipKeys.team(churchId, id) });
      return invalidateWorship(client, churchId);
    },
  });
}

export const useSavePosition = (churchId: string, teamId: string) =>
  useWorshipMutation(
    churchId,
    ({ id, ...body }: z.input<typeof servingPositionInputSchema> & { id?: string }) =>
      request(servingPositionResponseSchema, {
        method: id ? 'PATCH' : 'POST',
        url: at(churchId, id ? `/teams/${teamId}/positions/${id}` : `/teams/${teamId}/positions`),
        data: servingPositionInputSchema.parse(body),
      }),
  );

export const useDeletePosition = (churchId: string, teamId: string) =>
  useWorshipMutation(churchId, (id: string) =>
    request(okSchema, { method: 'DELETE', url: at(churchId, `/teams/${teamId}/positions/${id}`) }),
  );

export const useAddTeamMember = (churchId: string, teamId: string) =>
  useWorshipMutation(churchId, (body: z.input<typeof servingTeamMemberInputSchema>) =>
    request(servingTeamMemberResponseSchema, {
      method: 'POST',
      url: at(churchId, `/teams/${teamId}/members`),
      data: servingTeamMemberInputSchema.parse(body),
    }),
  );

export const useUpdateTeamMember = (churchId: string, teamId: string) =>
  useWorshipMutation(
    churchId,
    ({ id, ...body }: z.input<typeof servingTeamMemberUpdateSchema> & { id: string }) =>
      request(servingTeamMemberResponseSchema, {
        method: 'PATCH',
        url: at(churchId, `/teams/${teamId}/members/${id}`),
        data: servingTeamMemberUpdateSchema.parse(body),
      }),
  );

export const useRemoveTeamMember = (churchId: string, teamId: string) =>
  useWorshipMutation(churchId, (id: string) =>
    request(okSchema, { method: 'DELETE', url: at(churchId, `/teams/${teamId}/members/${id}`) }),
  );

export const useAddBlockout = (churchId: string) =>
  useWorshipMutation(churchId, (body: z.input<typeof volunteerBlockoutInputSchema>) =>
    request(volunteerBlockoutResponseSchema, {
      method: 'POST',
      url: at(churchId, '/blockouts'),
      data: volunteerBlockoutInputSchema.parse(body),
    }),
  );

export const useDeleteBlockout = (churchId: string) =>
  useWorshipMutation(churchId, (id: string) =>
    request(okSchema, { method: 'DELETE', url: at(churchId, `/blockouts/${id}`) }),
  );
