import {
  personRecordsSchema,
  recordPreviewSchema,
  recordsOverviewSchema,
  recordsPeopleSchema,
  recordsSettingsResponseSchema,
  registryRecordDetailSchema,
  registryRecordListSchema,
  registryRecordResponseSchema,
  type RecordPreviewBody,
  type RecordsSettings,
  type RegistryRecordCorrection,
  type RegistryRecordInput,
  type RegistryRecordListQuery,
  type VoidRegistryRecordBody,
} from '@tatagereja/shared';
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { request } from '@/lib/api';
import { churchScope, keys } from '@/lib/keys';

/** Query keys of the records module, all below `['church', id, 'records']`. */
export const recordsKeys = {
  all: (churchId: string) => [...churchScope(churchId), 'records'] as const,
  overview: (churchId: string) => [...recordsKeys.all(churchId), 'overview'] as const,
  settings: (churchId: string) => [...recordsKeys.all(churchId), 'settings'] as const,
  entries: (churchId: string) => [...recordsKeys.all(churchId), 'entries'] as const,
  list: (churchId: string, params: Record<string, unknown>) =>
    [...recordsKeys.entries(churchId), 'list', params] as const,
  record: (churchId: string, id: string) =>
    [...recordsKeys.entries(churchId), 'detail', id] as const,
  person: (churchId: string, personId: string) =>
    [...recordsKeys.all(churchId), 'person', personId] as const,
  people: (churchId: string, q: string) => [...recordsKeys.all(churchId), 'people', q] as const,
};

/**
 * A record moves the register, the overview, the person pages (status, baptism and wedding
 * dates, timeline) and the dashboard, so writes refresh all of them. Only mounted queries
 * refetch.
 */
export const invalidateRecords = (client: QueryClient, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: recordsKeys.all(churchId) }),
    client.invalidateQueries({ queryKey: keys.people(churchId) }),
    client.invalidateQueries({ queryKey: keys.dashboard(churchId) }),
  ]);

const at = (churchId: string, path = '') => `/churches/${churchId}/records${path}`;

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export const overviewQuery = (churchId: string) =>
  queryOptions({
    queryKey: recordsKeys.overview(churchId),
    queryFn: () => request(recordsOverviewSchema, { url: at(churchId, '/overview') }),
  });

export const settingsQuery = (churchId: string) =>
  queryOptions({
    queryKey: recordsKeys.settings(churchId),
    queryFn: () => request(recordsSettingsResponseSchema, { url: at(churchId, '/settings') }),
  });

export type RecordListParams = Partial<RegistryRecordListQuery>;

export const recordsQuery = (churchId: string, params: RecordListParams = {}) =>
  queryOptions({
    queryKey: recordsKeys.list(churchId, params),
    queryFn: () => request(registryRecordListSchema, { url: at(churchId, '/entries'), params }),
    placeholderData: keepPreviousData,
  });

export const recordQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: recordsKeys.record(churchId, id),
    queryFn: () => request(registryRecordDetailSchema, { url: at(churchId, `/entries/${id}`) }),
  });

/** The records naming a person: for the person page, the timeline and "My records". */
export const personRecordsQuery = (churchId: string, personId: string) =>
  queryOptions({
    queryKey: recordsKeys.person(churchId, personId),
    queryFn: () =>
      request(personRecordsSchema, { url: `/churches/${churchId}/people/${personId}/records` }),
  });

export const recordsPeopleQuery = (churchId: string, q: string) =>
  queryOptions({
    queryKey: recordsKeys.people(churchId, q),
    queryFn: () =>
      request(recordsPeopleSchema, {
        url: at(churchId, '/people'),
        params: { q: q || undefined, limit: 20 },
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

// ---------------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------------

/** The number and side effects shown in the confirmation dialog before saving. */
export function usePreviewRecord(churchId: string) {
  return useMutation({
    mutationFn: (body: RecordPreviewBody) =>
      request(recordPreviewSchema, {
        method: 'POST',
        url: at(churchId, '/entries/preview'),
        data: body,
      }),
  });
}

export function useCreateRecord(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RegistryRecordInput) =>
      request(registryRecordResponseSchema, {
        method: 'POST',
        url: at(churchId, '/entries'),
        data: body,
      }),
    onSuccess: () => invalidateRecords(client, churchId),
  });
}

export function useCorrectRecord(churchId: string, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RegistryRecordCorrection) =>
      request(registryRecordResponseSchema, {
        method: 'PUT',
        url: at(churchId, `/entries/${id}`),
        data: body,
      }),
    onSuccess: () => invalidateRecords(client, churchId),
  });
}

export function useVoidRecord(churchId: string, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: VoidRegistryRecordBody) =>
      request(registryRecordResponseSchema, {
        method: 'POST',
        url: at(churchId, `/entries/${id}/void`),
        data: body,
      }),
    onSuccess: () => invalidateRecords(client, churchId),
  });
}

export function useSaveRecordsSettings(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordsSettings) =>
      request(recordsSettingsResponseSchema, {
        method: 'PUT',
        url: at(churchId, '/settings'),
        data: body,
      }),
    onSuccess: (data) => {
      client.setQueryData(recordsKeys.settings(churchId), data);
      return invalidateRecords(client, churchId);
    },
  });
}
