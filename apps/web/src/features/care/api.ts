import {
  careCaseListSchema,
  careCaseResponseSchema,
  careNoteListSchema,
  careNoteResponseSchema,
  careOverviewSchema,
  careTaskListSchema,
  careTaskResponseSchema,
  careTeamListSchema,
  careVisitListSchema,
  careVisitResponseSchema,
  diakoniaAidListSchema,
  diakoniaAidResponseSchema,
  householdLookupListSchema,
  okSchema,
  paginatedSchema,
  personSummarySchema,
  prayResultSchema,
  prayerRequestListSchema,
  prayerRequestResponseSchema,
  visitorFollowUpListSchema,
  visitorFollowUpResponseSchema,
  type CareCase,
  type CareCaseInput,
  type CareCaseListQuery,
  type CareCaseUpdate,
  type CareNoteInput,
  type CareTask,
  type CareTaskInput,
  type CareTaskList,
  type CareTaskListQuery,
  type CareTaskStatus,
  type CareTaskUpdate,
  type CareVisitInput,
  type CareVisitListQuery,
  type DiakoniaAidInput,
  type DiakoniaAidListQuery,
  type FollowUpStage,
  type ModeratePrayerRequestBody,
  type PrayerRequest,
  type PrayerRequestInput,
  type PrayerRequestList,
  type PrayerRequestListQuery,
  type VisitorFollowUpInput,
  type VisitorFollowUpList,
  type VisitorFollowUpListQuery,
  type VisitorFollowUpUpdate,
} from '@tatagereja/shared';
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { request } from '@/lib/api';
import { churchScope, keys } from '@/lib/keys';

/*
 * Care queries and mutations. Every key lives under `['church', id, 'care', ...]`: cases, notes,
 * visits, tasks, follow-ups and the overview all count each other (a task on a case, a visit for a
 * follow-up), so a write invalidates the whole module, the home dashboard and the notifications.
 */

export const careKeys = {
  all: (churchId: string) => [...churchScope(churchId), 'care'] as const,
  overview: (churchId: string) => [...careKeys.all(churchId), 'overview'] as const,
  team: (churchId: string, scope: string) => [...careKeys.all(churchId), 'team', scope] as const,
  households: (churchId: string, q: string) =>
    [...careKeys.all(churchId), 'households', q] as const,
  people: (churchId: string, q: string) => [...careKeys.all(churchId), 'people', q] as const,
  list: (churchId: string, kind: string, params: Record<string, unknown>) =>
    [...careKeys.all(churchId), kind, 'list', params] as const,
  lists: (churchId: string, kind: string) => [...careKeys.all(churchId), kind, 'list'] as const,
  detail: (churchId: string, kind: string, id: string) =>
    [...careKeys.all(churchId), kind, 'detail', id] as const,
  notes: (churchId: string, caseId: string) =>
    [...careKeys.all(churchId), 'cases', 'notes', caseId] as const,
};

type Params<T> = Partial<{ [K in keyof T]: T[K] | string }>;

/** Drops empty values so they neither reach the URL nor split the cache. */
const clean = <T extends Record<string, unknown>>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== '' && value !== null,
    ),
  ) as Partial<T>;

const path = (churchId: string, rest = '') => `/churches/${churchId}/care${rest}`;

/** Everything a care write can change: the module, the home dashboard and notifications. */
export const invalidateCare = (client: QueryClient, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: careKeys.all(churchId) }),
    client.invalidateQueries({ queryKey: keys.dashboard(churchId) }),
    client.invalidateQueries({ queryKey: ['notifications'] }),
  ]);

// ---- Lookups -------------------------------------------------------------------------------------

export const careOverviewQuery = (churchId: string) =>
  queryOptions({
    queryKey: careKeys.overview(churchId),
    queryFn: () => request(careOverviewSchema, { url: path(churchId, '/overview') }),
  });

export const careTeamQuery = (churchId: string, scope: 'team' | 'all' = 'team') =>
  queryOptions({
    queryKey: careKeys.team(churchId, scope),
    queryFn: () => request(careTeamListSchema, { url: path(churchId, '/team'), params: { scope } }),
    staleTime: 5 * 60_000,
  });

export const householdLookupQuery = (churchId: string, q: string) =>
  queryOptions({
    queryKey: careKeys.households(churchId, q),
    queryFn: () =>
      request(householdLookupListSchema, {
        url: path(churchId, '/households'),
        params: clean({ q }),
      }),
    staleTime: 60_000,
  });

const peopleLookupSchema = paginatedSchema(personSummarySchema);

/** The directory search used by the person pickers (summaries only). */
export const peopleLookupQuery = (churchId: string, q: string) =>
  queryOptions({
    queryKey: careKeys.people(churchId, q),
    queryFn: () =>
      request(peopleLookupSchema, {
        url: `/churches/${churchId}/people`,
        params: clean({ q, limit: 30 }),
      }),
    staleTime: 60_000,
  });

// ---- Cases ---------------------------------------------------------------------------------------

export type CaseListParams = Params<
  Pick<
    CareCaseListQuery,
    'q' | 'page' | 'limit' | 'status' | 'category' | 'priority' | 'confidentiality' | 'sort'
  >
> & { mine?: 'true'; personId?: string };

export const casesQuery = (churchId: string, params: CaseListParams) =>
  queryOptions({
    queryKey: careKeys.list(churchId, 'cases', clean(params)),
    queryFn: () =>
      request(careCaseListSchema, { url: path(churchId, '/cases'), params: clean(params) }),
  });

export const caseQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: careKeys.detail(churchId, 'cases', id),
    queryFn: () => request(careCaseResponseSchema, { url: path(churchId, `/cases/${id}`) }),
  });

export const caseNotesQuery = (churchId: string, caseId: string) =>
  queryOptions({
    queryKey: careKeys.notes(churchId, caseId),
    queryFn: () => request(careNoteListSchema, { url: path(churchId, `/cases/${caseId}/notes`) }),
  });

/** The update body of a case, from its detail, with some fields changed. */
export const caseUpdateFrom = (careCase: CareCase, patch: Partial<CareCaseUpdate> = {}) => ({
  personId: careCase.person?.id ?? null,
  householdId: careCase.household?.id ?? null,
  category: careCase.category,
  priority: careCase.priority,
  status: careCase.status,
  confidentiality: careCase.confidentiality,
  title: careCase.title,
  description: careCase.description,
  nextActionDate: careCase.nextActionDate,
  nextActionNote: careCase.nextActionNote,
  closedReason: careCase.closedReason,
  ...patch,
});

export function useSaveCase(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: (CareCaseInput | CareCaseUpdate) & { id?: string }) =>
      request(careCaseResponseSchema, {
        url: path(churchId, id ? `/cases/${id}` : '/cases'),
        method: id ? 'PATCH' : 'POST',
        data: body,
      }),
    onSuccess: async (data) => {
      client.setQueryData(careKeys.detail(churchId, 'cases', data.case.id), data);
      await invalidateCare(client, churchId);
    },
  });
}

export function useDeleteCase(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { url: path(churchId, `/cases/${id}`), method: 'DELETE' }),
    onSuccess: async (_data, id) => {
      client.removeQueries({ queryKey: careKeys.detail(churchId, 'cases', id) });
      await invalidateCare(client, churchId);
    },
  });
}

export function useSetCaregivers(churchId: string, caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userIds: string[]) =>
      request(careCaseResponseSchema, {
        url: path(churchId, `/cases/${caseId}/caregivers`),
        method: 'PUT',
        data: { userIds },
      }),
    onSuccess: async (data) => {
      client.setQueryData(careKeys.detail(churchId, 'cases', caseId), data);
      await invalidateCare(client, churchId);
    },
  });
}

export function useAddNote(churchId: string, caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CareNoteInput) =>
      request(careNoteResponseSchema, {
        url: path(churchId, `/cases/${caseId}/notes`),
        method: 'POST',
        data: body,
      }),
    onSuccess: () => invalidateCare(client, churchId),
  });
}

export function useUpdateNote(churchId: string, caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      request(careNoteResponseSchema, {
        url: path(churchId, `/cases/${caseId}/notes/${id}`),
        method: 'PATCH',
        data: { body },
      }),
    onSuccess: () => invalidateCare(client, churchId),
  });
}

export function useDeleteNote(churchId: string, caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { url: path(churchId, `/cases/${caseId}/notes/${id}`), method: 'DELETE' }),
    onSuccess: () => invalidateCare(client, churchId),
  });
}

// ---- Visits --------------------------------------------------------------------------------------

export type VisitListParams = Params<
  Pick<CareVisitListQuery, 'q' | 'page' | 'limit' | 'from' | 'to' | 'caseId' | 'personId'>
> & { followUpNeeded?: 'true' | 'false'; mine?: 'true' };

export const visitsQuery = (churchId: string, params: VisitListParams) =>
  queryOptions({
    queryKey: careKeys.list(churchId, 'visits', clean(params)),
    queryFn: () =>
      request(careVisitListSchema, { url: path(churchId, '/visits'), params: clean(params) }),
  });

export const visitQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: careKeys.detail(churchId, 'visits', id),
    queryFn: () => request(careVisitResponseSchema, { url: path(churchId, `/visits/${id}`) }),
  });

export function useSaveVisit(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CareVisitInput & { id?: string }) =>
      request(careVisitResponseSchema, {
        url: path(churchId, id ? `/visits/${id}` : '/visits'),
        method: id ? 'PATCH' : 'POST',
        data: body,
      }),
    onSuccess: async (data) => {
      client.setQueryData(careKeys.detail(churchId, 'visits', data.visit.id), data);
      await invalidateCare(client, churchId);
    },
  });
}

export function useDeleteVisit(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { url: path(churchId, `/visits/${id}`), method: 'DELETE' }),
    onSuccess: async (_data, id) => {
      client.removeQueries({ queryKey: careKeys.detail(churchId, 'visits', id) });
      await invalidateCare(client, churchId);
    },
  });
}

// ---- Prayer requests -----------------------------------------------------------------------------

export type PrayerListParams = Params<
  Pick<PrayerRequestListQuery, 'q' | 'page' | 'limit' | 'scope' | 'status' | 'visibility'>
>;

export const prayerRequestsQuery = (churchId: string, params: PrayerListParams) =>
  queryOptions({
    queryKey: careKeys.list(churchId, 'prayer', clean(params)),
    queryFn: () =>
      request(prayerRequestListSchema, {
        url: path(churchId, '/prayer-requests'),
        params: clean(params),
      }),
  });

export const prayerRequestQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: careKeys.detail(churchId, 'prayer', id),
    queryFn: () =>
      request(prayerRequestResponseSchema, { url: path(churchId, `/prayer-requests/${id}`) }),
  });

/**
 * Applies `update` to a prayer request in every cached list and its detail, returning a
 * function that restores them (the optimistic "I prayed").
 */
async function patchPrayerCaches(
  client: QueryClient,
  churchId: string,
  id: string,
  update: (request: PrayerRequest) => PrayerRequest,
): Promise<() => void> {
  const listKey = careKeys.lists(churchId, 'prayer');
  const detailKey = careKeys.detail(churchId, 'prayer', id);
  await Promise.all([
    client.cancelQueries({ queryKey: listKey }),
    client.cancelQueries({ queryKey: detailKey }),
  ]);
  const lists = client.getQueriesData<PrayerRequestList>({ queryKey: listKey });
  const detail = client.getQueryData<{ request: PrayerRequest }>(detailKey);
  client.setQueriesData<PrayerRequestList>({ queryKey: listKey }, (old) =>
    old ? { ...old, items: old.items.map((item) => (item.id === id ? update(item) : item)) } : old,
  );
  if (detail) client.setQueryData(detailKey, { request: update(detail.request) });
  return () => {
    for (const [key, value] of lists) client.setQueryData(key, value);
    if (detail) client.setQueryData(detailKey, detail);
  };
}

export function usePray(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(prayResultSchema, {
        url: path(churchId, `/prayer-requests/${id}/pray`),
        method: 'POST',
      }),
    onMutate: (id) =>
      patchPrayerCaches(client, churchId, id, (item) =>
        item.prayedByMe ? item : { ...item, prayedByMe: true, prayedCount: item.prayedCount + 1 },
      ),
    onError: (_error, _id, rollback) => rollback?.(),
    onSuccess: (result, id) =>
      patchPrayerCaches(client, churchId, id, (item) => ({ ...item, ...result })),
    onSettled: () => client.invalidateQueries({ queryKey: careKeys.overview(churchId) }),
  });
}

export function useSavePrayerRequest(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: PrayerRequestInput & { id?: string }) =>
      request(prayerRequestResponseSchema, {
        url: path(churchId, id ? `/prayer-requests/${id}` : '/prayer-requests'),
        method: id ? 'PATCH' : 'POST',
        data: body,
      }),
    onSuccess: async (data) => {
      client.setQueryData(careKeys.detail(churchId, 'prayer', data.request.id), data);
      await invalidateCare(client, churchId);
    },
  });
}

export function useModeratePrayer(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: Pick<ModeratePrayerRequestBody, 'decision'> & { id: string; note?: string | null }) =>
      request(prayerRequestResponseSchema, {
        url: path(churchId, `/prayer-requests/${id}/moderate`),
        method: 'POST',
        data: body,
      }),
    onSuccess: async (data) => {
      client.setQueryData(careKeys.detail(churchId, 'prayer', data.request.id), data);
      await invalidateCare(client, churchId);
    },
  });
}

export function useAnswerPrayer(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, testimony, reopen }: { id: string; testimony?: string; reopen?: boolean }) =>
      request(prayerRequestResponseSchema, {
        url: path(churchId, `/prayer-requests/${id}/answer`),
        method: reopen ? 'DELETE' : 'POST',
        data: reopen ? undefined : { testimony },
      }),
    onSuccess: async (data) => {
      client.setQueryData(careKeys.detail(churchId, 'prayer', data.request.id), data);
      await invalidateCare(client, churchId);
    },
  });
}

export function useDeletePrayer(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { url: path(churchId, `/prayer-requests/${id}`), method: 'DELETE' }),
    onSuccess: async (_data, id) => {
      client.removeQueries({ queryKey: careKeys.detail(churchId, 'prayer', id) });
      await invalidateCare(client, churchId);
    },
  });
}

// ---- Visitor follow-up ---------------------------------------------------------------------------

export type FollowUpListParams = Params<
  Pick<VisitorFollowUpListQuery, 'q' | 'stage' | 'assignedUserId'>
> & { mine?: 'true' };

export const followUpsQuery = (churchId: string, params: FollowUpListParams) =>
  queryOptions({
    queryKey: careKeys.list(churchId, 'follow-ups', clean(params)),
    queryFn: () =>
      request(visitorFollowUpListSchema, {
        url: path(churchId, '/follow-ups'),
        params: clean(params),
      }),
  });

export const followUpQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: careKeys.detail(churchId, 'follow-ups', id),
    queryFn: () =>
      request(visitorFollowUpResponseSchema, { url: path(churchId, `/follow-ups/${id}`) }),
  });

export function useCreateFollowUp(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: VisitorFollowUpInput) =>
      request(visitorFollowUpResponseSchema, {
        url: path(churchId, '/follow-ups'),
        method: 'POST',
        data: body,
      }),
    onSuccess: async () => {
      await Promise.all([
        invalidateCare(client, churchId),
        client.invalidateQueries({ queryKey: keys.people(churchId) }),
      ]);
    },
  });
}

export function useUpdateFollowUp(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: VisitorFollowUpUpdate & { id: string }) =>
      request(visitorFollowUpResponseSchema, {
        url: path(churchId, `/follow-ups/${id}`),
        method: 'PATCH',
        data: body,
      }),
    onSuccess: async (data) => {
      client.setQueryData(careKeys.detail(churchId, 'follow-ups', data.followUp.id), data);
      await invalidateCare(client, churchId);
    },
  });
}

/** Moves a visitor to another stage, instantly on the board, rolled back on error. */
export function useMoveFollowUp(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      stage,
      closedReason,
    }: {
      id: string;
      stage: FollowUpStage;
      closedReason?: string | null;
    }) =>
      request(visitorFollowUpResponseSchema, {
        url: path(churchId, `/follow-ups/${id}/stage`),
        method: 'POST',
        data: { stage, closedReason },
      }),
    onMutate: async ({ id, stage }) => {
      const listKey = careKeys.lists(churchId, 'follow-ups');
      await client.cancelQueries({ queryKey: listKey });
      const previous = client.getQueriesData<VisitorFollowUpList>({ queryKey: listKey });
      client.setQueriesData<VisitorFollowUpList>({ queryKey: listKey }, (old) => {
        if (!old) return old;
        const moving = old.items.find((item) => item.id === id);
        if (!moving || moving.stage === stage) return old;
        return {
          items: old.items.map((item) => (item.id === id ? { ...item, stage } : item)),
          counts: {
            ...old.counts,
            [moving.stage]: Math.max(0, old.counts[moving.stage] - 1),
            [stage]: old.counts[stage] + 1,
          },
        };
      });
      return () => {
        for (const [key, value] of previous) client.setQueryData(key, value);
      };
    },
    onError: (_error, _vars, rollback) => rollback?.(),
    onSettled: async () => {
      await Promise.all([
        invalidateCare(client, churchId),
        client.invalidateQueries({ queryKey: keys.people(churchId) }),
      ]);
    },
  });
}

export function useDeleteFollowUp(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { url: path(churchId, `/follow-ups/${id}`), method: 'DELETE' }),
    onSuccess: async (_data, id) => {
      client.removeQueries({ queryKey: careKeys.detail(churchId, 'follow-ups', id) });
      await invalidateCare(client, churchId);
    },
  });
}

// ---- Tasks ---------------------------------------------------------------------------------------

export type TaskListParams = Params<
  Pick<CareTaskListQuery, 'scope' | 'status' | 'followUpId' | 'caseId' | 'q'>
> & { overdue?: 'true' };

export const tasksQuery = (churchId: string, params: TaskListParams) =>
  queryOptions({
    queryKey: careKeys.list(churchId, 'tasks', clean(params)),
    queryFn: () =>
      request(careTaskListSchema, { url: path(churchId, '/tasks'), params: clean(params) }),
  });

export function useSaveTask(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: (CareTaskInput | CareTaskUpdate) & { id?: string }) =>
      request(careTaskResponseSchema, {
        url: path(churchId, id ? `/tasks/${id}` : '/tasks'),
        method: id ? 'PATCH' : 'POST',
        data: body,
      }),
    onSuccess: () => invalidateCare(client, churchId),
  });
}

/** Ticks a task off (or reopens it) instantly in every task list, rolled back on error. */
export function useSetTaskStatus(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CareTaskStatus }) =>
      request(careTaskResponseSchema, {
        url: path(churchId, `/tasks/${id}/status`),
        method: 'PATCH',
        data: { status },
      }),
    onMutate: async ({ id, status }) => {
      const listKey: QueryKey = careKeys.lists(churchId, 'tasks');
      await client.cancelQueries({ queryKey: listKey });
      const previous = client.getQueriesData<CareTaskList>({ queryKey: listKey });
      client.setQueriesData<CareTaskList>({ queryKey: listKey }, (old) =>
        old
          ? {
              items: old.items.map((item): CareTask =>
                item.id === id
                  ? {
                      ...item,
                      status,
                      isOverdue: status === 'open' && item.isOverdue,
                      completedAt: status === 'done' ? new Date().toISOString() : null,
                    }
                  : item,
              ),
            }
          : old,
      );
      return () => {
        for (const [key, value] of previous) client.setQueryData(key, value);
      };
    },
    onError: (_error, _vars, rollback) => rollback?.(),
    onSettled: () => invalidateCare(client, churchId),
  });
}

export function useDeleteTask(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { url: path(churchId, `/tasks/${id}`), method: 'DELETE' }),
    onSuccess: () => invalidateCare(client, churchId),
  });
}

// ---- Diakonia ------------------------------------------------------------------------------------

export type AidListParams = Params<
  Pick<DiakoniaAidListQuery, 'q' | 'page' | 'limit' | 'category' | 'form' | 'from' | 'to'>
> & { includeVoided?: 'true'; caseId?: string; personId?: string };

export const aidListQuery = (churchId: string, params: AidListParams) =>
  queryOptions({
    queryKey: careKeys.list(churchId, 'diakonia', clean(params)),
    queryFn: () =>
      request(diakoniaAidListSchema, { url: path(churchId, '/diakonia'), params: clean(params) }),
  });

export const aidQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: careKeys.detail(churchId, 'diakonia', id),
    queryFn: () => request(diakoniaAidResponseSchema, { url: path(churchId, `/diakonia/${id}`) }),
  });

export function useSaveAid(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: DiakoniaAidInput & { id?: string }) =>
      request(diakoniaAidResponseSchema, {
        url: path(churchId, id ? `/diakonia/${id}` : '/diakonia'),
        method: id ? 'PATCH' : 'POST',
        data: body,
      }),
    onSuccess: async (data) => {
      client.setQueryData(careKeys.detail(churchId, 'diakonia', data.aid.id), data);
      await invalidateCare(client, churchId);
    },
  });
}

export function useVoidAid(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      request(diakoniaAidResponseSchema, {
        url: path(churchId, `/diakonia/${id}/void`),
        method: 'POST',
        data: { reason },
      }),
    onSuccess: async (data) => {
      client.setQueryData(careKeys.detail(churchId, 'diakonia', data.aid.id), data);
      await invalidateCare(client, churchId);
    },
  });
}
