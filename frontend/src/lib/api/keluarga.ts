import {
  createQuery,
  createMutation,
  useQueryClient,
} from '@tanstack/svelte-query';
import { apiClient } from './client';
import type {
  CreateKeluargaInput,
  Keluarga,
  KeluargaDetail,
  Paginated,
} from '$lib/types';

const KEY = ['keluarga'] as const;

export interface KeluargaListParams {
  limit?: number;
  offset?: number;
  q?: string;
}

export function keluargaListQuery(params: () => KeluargaListParams) {
  return createQuery({
    queryKey: ['keluarga', 'list', params()],
    queryFn: () => {
      const p = params();
      const search = new URLSearchParams();
      if (p.limit !== undefined) search.set('limit', String(p.limit));
      if (p.offset !== undefined) search.set('offset', String(p.offset));
      if (p.q && p.q.trim() !== '') search.set('q', p.q.trim());
      const qs = search.toString();
      return apiClient.get<Paginated<Keluarga>>(`/keluarga${qs ? `?${qs}` : ''}`);
    },
  });
}

export function keluargaDetailQuery(id: () => number | null) {
  return createQuery({
    queryKey: ['keluarga', 'detail', id()],
    enabled: id() !== null,
    queryFn: () => apiClient.get<KeluargaDetail>(`/keluarga/${id()}`),
  });
}

export function useCreateKeluarga() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (data: CreateKeluargaInput) =>
      apiClient.post<Keluarga>('/keluarga', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateKeluarga() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: ({ id, data }: { id: number; data: CreateKeluargaInput }) =>
      apiClient.put<Keluarga>(`/keluarga/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteKeluarga() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/keluarga/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
