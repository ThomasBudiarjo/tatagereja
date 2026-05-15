import {
  createQuery,
  createMutation,
  useQueryClient,
} from '@tanstack/svelte-query';
import { apiClient } from './client';
import type {
  CreateKebaktianInput,
  CreateRecurringKebaktianInput,
  JadwalSlot,
  JadwalSlotInput,
  Kebaktian,
  KebaktianList,
} from '$lib/types';

const KEY = ['kebaktian'] as const;

export interface KebaktianListParams {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function kebaktianListQuery(params: () => KebaktianListParams) {
  return createQuery({
    queryKey: ['kebaktian', 'list', params()],
    queryFn: () => {
      const p = params();
      const search = new URLSearchParams();
      if (p.from) search.set('from', p.from);
      if (p.to) search.set('to', p.to);
      if (p.limit !== undefined) search.set('limit', String(p.limit));
      if (p.offset !== undefined) search.set('offset', String(p.offset));
      const qs = search.toString();
      return apiClient.get<KebaktianList>(`/kebaktian${qs ? `?${qs}` : ''}`);
    },
  });
}

export function kebaktianDetailQuery(id: () => number | null) {
  return createQuery({
    queryKey: ['kebaktian', 'detail', id()],
    enabled: id() !== null,
    queryFn: () => apiClient.get<Kebaktian>(`/kebaktian/${id()}`),
  });
}

export function useCreateKebaktian() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (data: CreateKebaktianInput) =>
      apiClient.post<Kebaktian>('/kebaktian', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useCreateRecurringKebaktian() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (data: CreateRecurringKebaktianInput) =>
      apiClient.post<{ created: Kebaktian[] }>('/kebaktian/recurring', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateKebaktian() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: ({ id, data }: { id: number; data: CreateKebaktianInput }) =>
      apiClient.put<Kebaktian>(`/kebaktian/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteKebaktian() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/kebaktian/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

interface JadwalResponse {
  data: JadwalSlot[];
  kebaktian_id: number;
}

export function kebaktianJadwalQuery(id: () => number | null) {
  return createQuery({
    queryKey: ['kebaktian', 'jadwal', id()],
    enabled: id() !== null,
    queryFn: () => apiClient.get<JadwalResponse>(`/kebaktian/${id()}/jadwal`),
  });
}

export function useUpsertKebaktianJadwal() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: ({ id, slots }: { id: number; slots: JadwalSlotInput[] }) =>
      apiClient.put<JadwalResponse>(`/kebaktian/${id}/jadwal`, { slots }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['kebaktian', 'jadwal', id] });
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
