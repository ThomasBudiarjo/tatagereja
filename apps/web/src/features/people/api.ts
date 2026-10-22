import {
  addFamilyMemberBodySchema,
  addHouseholdMemberBodySchema,
  areaAssignBodySchema,
  areaCoordinatorBodySchema,
  areaDetailSchema,
  areaInputSchema,
  areaListSchema,
  areaResponseSchema,
  assignAreaBodySchema,
  createFamilyMemberBodySchema,
  customFieldDefinitionInputSchema,
  customFieldDefinitionListSchema,
  customFieldDefinitionResponseSchema,
  directoryAccountListSchema,
  directoryListSchema,
  directoryMeSchema,
  directoryPersonResponseSchema,
  duplicateListSchema,
  familyMemberResultSchema,
  householdCreateSchema,
  householdDetailSchema,
  householdInputSchema,
  householdListSchema,
  householdMemberResultSchema,
  householdResponseSchema,
  linkPersonUserBodySchema,
  mergePeopleBodySchema,
  mergeResultSchema,
  myAttendanceSchema,
  okSchema,
  peopleStatsSchema,
  personFormSchema,
  personImportBodySchema,
  personImportResultSchema,
  personPrivacyInputSchema,
  personPrivacyResponseSchema,
  personPrivateDetailsInputSchema,
  personPrivateDetailsResponseSchema,
  personProfileSchema,
  personTagInputSchema,
  personTagListSchema,
  personTagResponseSchema,
  personTimelineSchema,
  updateHouseholdMemberBodySchema,
  type DirectoryExportQuery,
  type DirectoryQuery,
  type HouseholdListQuery,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { churchKeys } from '@/features/churches/api';
import { api, request } from '@/lib/api';
import { churchScope, keys } from '@/lib/keys';
import { invalidateAll } from '@/lib/use-mutation-toast';

/*
 * Queries and mutations of the people module: the directory, person profiles, households,
 * areas, tags and custom fields, import/export and merging. Keys live under the church scope,
 * so switching churches never reuses cached data.
 */

export const peopleKeys = {
  summary: (churchId: string) => [...keys.people(churchId), 'summary'] as const,
  me: (churchId: string) => [...keys.people(churchId), 'me'] as const,
  timeline: (churchId: string, id: string) => [...keys.people(churchId), 'timeline', id] as const,
  duplicates: (churchId: string) => [...keys.people(churchId), 'duplicates'] as const,
  tags: (churchId: string) => [...churchScope(churchId), 'directory', 'tags'] as const,
  fields: (churchId: string) => [...churchScope(churchId), 'directory', 'fields'] as const,
  households: (churchId: string) => [...churchScope(churchId), 'households'] as const,
  householdList: (churchId: string, params: Record<string, unknown>) =>
    [...churchScope(churchId), 'households', 'list', params] as const,
  household: (churchId: string, id: string) =>
    [...churchScope(churchId), 'households', 'detail', id] as const,
  areas: (churchId: string) => [...churchScope(churchId), 'areas'] as const,
  areaList: (churchId: string, params: Record<string, unknown>) =>
    [...churchScope(churchId), 'areas', 'list', params] as const,
  area: (churchId: string, id: string) =>
    [...churchScope(churchId), 'areas', 'detail', id] as const,
};

/**
 * A change to people touches the directory, families, area counts, group rosters and the
 * home dashboard; refresh all of them so no screen shows stale data.
 */
export const invalidatePeopleData = (client: QueryClient, churchId: string) =>
  invalidateAll(client, [
    keys.people(churchId),
    peopleKeys.households(churchId),
    peopleKeys.areas(churchId),
    peopleKeys.tags(churchId),
    keys.groups(churchId),
    keys.dashboard(churchId),
  ]);

/** Merging, deleting or relinking a person reaches events, attendance and more: refresh all. */
const invalidateChurch = (client: QueryClient, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: churchScope(churchId) }),
    client.invalidateQueries({ queryKey: churchKeys.detail(churchId) }),
  ]);

export type PeopleListParams = Partial<Omit<DirectoryQuery, 'hasAccount'>> & {
  hasAccount?: boolean;
};

/** Query params as the API expects them: booleans as strings, empty values left out. */
const toParams = (params: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, typeof value === 'boolean' ? String(value) : value]),
  );

export const peopleListQuery = (churchId: string, params: PeopleListParams = {}) =>
  queryOptions({
    queryKey: keys.peopleList(churchId, params),
    queryFn: () =>
      request(directoryListSchema, {
        url: `/churches/${churchId}/people`,
        params: toParams(params),
      }),
  });

export const peopleSummaryQuery = (churchId: string) =>
  queryOptions({
    queryKey: peopleKeys.summary(churchId),
    queryFn: () => request(peopleStatsSchema, { url: `/churches/${churchId}/directory/summary` }),
  });

export const directoryMeQuery = (churchId: string) =>
  queryOptions({
    queryKey: peopleKeys.me(churchId),
    queryFn: () => request(directoryMeSchema, { url: `/churches/${churchId}/directory/me` }),
    staleTime: 60_000,
  });

/** The groups menu badge: pending join requests the caller decides on. */
export const pendingJoinRequestsBadge = (churchId: string) => ({
  queryKey: [...peopleKeys.me(churchId), 'badge'] as const,
  queryFn: async () =>
    (await request(directoryMeSchema, { url: `/churches/${churchId}/directory/me` }))
      .pendingJoinRequests,
  refetchInterval: 120_000,
  staleTime: 60_000,
});

/** Member accounts for linking people and choosing leaders or coordinators. */
export const accountsQuery = (churchId: string) =>
  queryOptions({
    queryKey: [...keys.people(churchId), 'accounts'] as const,
    queryFn: () =>
      request(directoryAccountListSchema, { url: `/churches/${churchId}/directory/accounts` }),
    staleTime: 60_000,
  });

export const personQuery = (churchId: string, personId: string) =>
  queryOptions({
    queryKey: keys.person(churchId, personId),
    queryFn: () =>
      request(personProfileSchema, { url: `/churches/${churchId}/people/${personId}` }),
  });

export const personTimelineQuery = (churchId: string, personId: string) =>
  queryOptions({
    queryKey: peopleKeys.timeline(churchId, personId),
    queryFn: () =>
      request(personTimelineSchema, {
        url: `/churches/${churchId}/people/${personId}/timeline`,
      }),
  });

export const personAttendanceQuery = (churchId: string, personId: string) =>
  queryOptions({
    queryKey: keys.personAttendance(churchId, personId),
    queryFn: () =>
      request(myAttendanceSchema, { url: `/churches/${churchId}/people/${personId}/attendance` }),
  });

export const tagsQuery = (churchId: string) =>
  queryOptions({
    queryKey: peopleKeys.tags(churchId),
    queryFn: () => request(personTagListSchema, { url: `/churches/${churchId}/directory/tags` }),
    staleTime: 60_000,
  });

export const fieldsQuery = (churchId: string) =>
  queryOptions({
    queryKey: peopleKeys.fields(churchId),
    queryFn: () =>
      request(customFieldDefinitionListSchema, {
        url: `/churches/${churchId}/directory/fields`,
      }),
    staleTime: 60_000,
  });

export const duplicatesQuery = (churchId: string) =>
  queryOptions({
    queryKey: peopleKeys.duplicates(churchId),
    queryFn: () => request(duplicateListSchema, { url: `/churches/${churchId}/people/duplicates` }),
  });

export type HouseholdListParams = Partial<HouseholdListQuery>;

export const householdsQuery = (churchId: string, params: HouseholdListParams = {}) =>
  queryOptions({
    queryKey: peopleKeys.householdList(churchId, params),
    queryFn: () =>
      request(householdListSchema, {
        url: `/churches/${churchId}/households`,
        params: toParams(params),
      }),
  });

export const householdQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: peopleKeys.household(churchId, id),
    queryFn: () =>
      request(householdDetailSchema, { url: `/churches/${churchId}/households/${id}` }),
  });

export const areasQuery = (churchId: string, params: { includeInactive?: boolean } = {}) =>
  queryOptions({
    queryKey: peopleKeys.areaList(churchId, params),
    queryFn: () =>
      request(areaListSchema, { url: `/churches/${churchId}/areas`, params: toParams(params) }),
    staleTime: 30_000,
  });

export const areaQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: peopleKeys.area(churchId, id),
    queryFn: () => request(areaDetailSchema, { url: `/churches/${churchId}/areas/${id}` }),
  });

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

export function useCreatePerson(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof personFormSchema>) =>
      request(directoryPersonResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/people`,
        data: personFormSchema.parse(body),
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

export function useUpdatePerson(churchId: string, personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof personFormSchema>) =>
      request(directoryPersonResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/people/${personId}`,
        data: personFormSchema.parse(body),
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

export function useDeletePerson(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (personId: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/people/${personId}` }),
    onSuccess: (_data, personId) => {
      client.removeQueries({ queryKey: keys.person(churchId, personId) });
      void invalidateChurch(client, churchId);
    },
  });
}

export function useSavePrivateDetails(churchId: string, personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof personPrivateDetailsInputSchema>) =>
      request(personPrivateDetailsResponseSchema, {
        method: 'PUT',
        url: `/churches/${churchId}/people/${personId}/private`,
        data: personPrivateDetailsInputSchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.person(churchId, personId) }),
  });
}

export function useLinkPersonUser(churchId: string, personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof linkPersonUserBodySchema>) =>
      request(directoryPersonResponseSchema, {
        method: 'PUT',
        url: `/churches/${churchId}/people/${personId}/user`,
        data: linkPersonUserBodySchema.parse(body),
      }),
    onSuccess: () => void invalidateChurch(client, churchId),
  });
}

/** Privacy toggles feel instant: the profile updates first and rolls back on error. */
export function useSavePrivacy(churchId: string, personId: string) {
  const client = useQueryClient();
  const queryKey = personQuery(churchId, personId).queryKey;
  return useMutation({
    mutationFn: (body: z.input<typeof personPrivacyInputSchema>) =>
      request(personPrivacyResponseSchema, {
        method: 'PUT',
        url: `/churches/${churchId}/people/${personId}/privacy`,
        data: personPrivacyInputSchema.parse(body),
      }),
    onMutate: async (body) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData(queryKey);
      client.setQueryData(queryKey, (old) =>
        old ? { ...old, privacy: personPrivacyInputSchema.parse(body) } : old,
      );
      return () => client.setQueryData(queryKey, previous);
    },
    onError: (_error, _body, rollback) => rollback?.(),
    onSettled: () => void invalidatePeopleData(client, churchId),
  });
}

export function useAssignPersonArea(churchId: string, personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof assignAreaBodySchema>) =>
      request(directoryPersonResponseSchema, {
        method: 'PUT',
        url: `/churches/${churchId}/people/${personId}/area`,
        data: assignAreaBodySchema.parse(body),
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

export function useAddFamilyMember(churchId: string, personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof addFamilyMemberBodySchema>) =>
      request(familyMemberResultSchema, {
        method: 'POST',
        url: `/churches/${churchId}/people/${personId}/family`,
        data: addFamilyMemberBodySchema.parse(body),
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

// ---------------------------------------------------------------------------------------------
// Import, export and merge
// ---------------------------------------------------------------------------------------------

export function useImportPeople(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof personImportBodySchema>) =>
      request(personImportResultSchema, {
        method: 'POST',
        url: `/churches/${churchId}/people/import`,
        data: personImportBodySchema.parse(body),
        timeout: 120_000,
      }),
    onSuccess: (result) => {
      if (!result.dryRun) void invalidatePeopleData(client, churchId);
    },
  });
}

/** Downloads the directory as CSV with the current filters (the API records the export). */
export async function downloadPeopleCsv(churchId: string, params: Partial<DirectoryExportQuery>) {
  const response = await api.get<Blob>(`/churches/${churchId}/people/export`, {
    params: toParams(params),
    responseType: 'blob',
    timeout: 120_000,
  });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'jemaat.csv';
  saveBlob(response.data, filename);
}

/** Downloads a group roster as CSV (leaders and managers; the API records the export). */
export async function downloadGroupRoster(churchId: string, groupId: string) {
  const response = await api.get<Blob>(`/churches/${churchId}/groups/${groupId}/roster`, {
    responseType: 'blob',
  });
  const disposition = String(response.headers['content-disposition'] ?? '');
  saveBlob(response.data, /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'roster.csv');
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useMergePeople(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof mergePeopleBodySchema>) =>
      request(mergeResultSchema, {
        method: 'POST',
        url: `/churches/${churchId}/people/merge`,
        data: mergePeopleBodySchema.parse(body),
      }),
    onSuccess: (_result, body) => {
      client.removeQueries({ queryKey: keys.person(churchId, body.mergeId) });
      void invalidateChurch(client, churchId);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Tags and custom fields
// ---------------------------------------------------------------------------------------------

const invalidateDefinitions = (client: QueryClient, churchId: string) =>
  invalidateAll(client, [
    peopleKeys.tags(churchId),
    peopleKeys.fields(churchId),
    keys.people(churchId),
  ]);

export function useSaveTag(churchId: string, tagId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof personTagInputSchema>) =>
      request(personTagResponseSchema, {
        method: tagId ? 'PATCH' : 'POST',
        url: `/churches/${churchId}/directory/tags${tagId ? `/${tagId}` : ''}`,
        data: personTagInputSchema.parse(body),
      }),
    onSuccess: () => void invalidateDefinitions(client, churchId),
  });
}

export function useDeleteTag(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/directory/tags/${tagId}` }),
    onSuccess: () => void invalidateDefinitions(client, churchId),
  });
}

export function useSaveField(churchId: string, fieldId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof customFieldDefinitionInputSchema>) =>
      request(customFieldDefinitionResponseSchema, {
        method: fieldId ? 'PATCH' : 'POST',
        url: `/churches/${churchId}/directory/fields${fieldId ? `/${fieldId}` : ''}`,
        data: customFieldDefinitionInputSchema.parse(body),
      }),
    onSuccess: () => void invalidateDefinitions(client, churchId),
  });
}

export function useDeleteField(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: string) =>
      request(okSchema, {
        method: 'DELETE',
        url: `/churches/${churchId}/directory/fields/${fieldId}`,
      }),
    onSuccess: () => void invalidateDefinitions(client, churchId),
  });
}

// ---------------------------------------------------------------------------------------------
// Households
// ---------------------------------------------------------------------------------------------

export function useCreateHousehold(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof householdCreateSchema>) =>
      request(householdResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/households`,
        data: householdCreateSchema.parse(body),
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

export function useUpdateHousehold(churchId: string, householdId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof householdInputSchema>) =>
      request(householdResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/households/${householdId}`,
        data: householdInputSchema.parse(body),
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

export function useDeleteHousehold(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (householdId: string) =>
      request(okSchema, {
        method: 'DELETE',
        url: `/churches/${churchId}/households/${householdId}`,
      }),
    onSuccess: (_data, householdId) => {
      client.removeQueries({ queryKey: peopleKeys.household(churchId, householdId) });
      void invalidatePeopleData(client, churchId);
    },
  });
}

export function useAddHouseholdMember(churchId: string, householdId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof addHouseholdMemberBodySchema>) =>
      request(householdMemberResultSchema, {
        method: 'POST',
        url: `/churches/${churchId}/households/${householdId}/members`,
        data: addHouseholdMemberBodySchema.parse(body),
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

export function useUpdateHouseholdMember(churchId: string, householdId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      personId,
      ...body
    }: z.input<typeof updateHouseholdMemberBodySchema> & { personId: string }) =>
      request(householdResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/households/${householdId}/members/${personId}`,
        data: updateHouseholdMemberBodySchema.parse(body),
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

export function useRemoveHouseholdMember(churchId: string, householdId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (personId: string) =>
      request(householdResponseSchema, {
        method: 'DELETE',
        url: `/churches/${churchId}/households/${householdId}/members/${personId}`,
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

export function useCreateFamilyMember(churchId: string, householdId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createFamilyMemberBodySchema>) =>
      request(familyMemberResultSchema, {
        method: 'POST',
        url: `/churches/${churchId}/households/${householdId}/family-members`,
        data: createFamilyMemberBodySchema.parse(body),
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

// ---------------------------------------------------------------------------------------------
// Areas
// ---------------------------------------------------------------------------------------------

export function useSaveArea(churchId: string, areaId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof areaInputSchema>) =>
      request(areaResponseSchema, {
        method: areaId ? 'PATCH' : 'POST',
        url: `/churches/${churchId}/areas${areaId ? `/${areaId}` : ''}`,
        data: areaInputSchema.parse(body),
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

export function useDeleteArea(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (areaId: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/areas/${areaId}` }),
    onSuccess: (_data, areaId) => {
      client.removeQueries({ queryKey: peopleKeys.area(churchId, areaId) });
      void invalidatePeopleData(client, churchId);
    },
  });
}

export function useAssignToArea(churchId: string, areaId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof areaAssignBodySchema>) =>
      request(areaResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/areas/${areaId}/assign`,
        data: areaAssignBodySchema.parse(body),
      }),
    onSuccess: () => void invalidatePeopleData(client, churchId),
  });
}

export function useAddAreaCoordinator(churchId: string, areaId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof areaCoordinatorBodySchema>) =>
      request(areaResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/areas/${areaId}/coordinators`,
        data: areaCoordinatorBodySchema.parse(body),
      }),
    onSuccess: () =>
      void invalidateAll(client, [peopleKeys.areas(churchId), peopleKeys.me(churchId)]),
  });
}

export function useRemoveAreaCoordinator(churchId: string, areaId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      request(areaResponseSchema, {
        method: 'DELETE',
        url: `/churches/${churchId}/areas/${areaId}/coordinators/${userId}`,
      }),
    onSuccess: () =>
      void invalidateAll(client, [peopleKeys.areas(churchId), peopleKeys.me(churchId)]),
  });
}
