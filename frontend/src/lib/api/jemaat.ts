import {
  createQuery,
  createMutation,
  useQueryClient,
} from '@tanstack/svelte-query';
import { apiClient } from './client';
import type { CreateJemaatInput, Jemaat, Paginated } from '$lib/types';

const KEY = ['jemaat'] as const;

export interface JemaatListParams {
  limit?: number;
  offset?: number;
  q?: string;
}

export function jemaatListQuery(params: () => JemaatListParams) {
  return createQuery({
    queryKey: ['jemaat', 'list', params()],
    queryFn: () => {
      const p = params();
      const search = new URLSearchParams();
      if (p.limit !== undefined) search.set('limit', String(p.limit));
      if (p.offset !== undefined) search.set('offset', String(p.offset));
      if (p.q && p.q.trim() !== '') search.set('q', p.q.trim());
      const qs = search.toString();
      return apiClient.get<Paginated<Jemaat>>(`/jemaat${qs ? `?${qs}` : ''}`);
    },
  });
}

export function jemaatDetailQuery(id: () => number | null) {
  return createQuery({
    queryKey: ['jemaat', 'detail', id()],
    enabled: id() !== null,
    queryFn: () => apiClient.get<Jemaat>(`/jemaat/${id()}`),
  });
}

export function useCreateJemaat() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (data: CreateJemaatInput) => apiClient.post<Jemaat>('/jemaat', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateJemaat() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: ({ id, data }: { id: number; data: CreateJemaatInput }) =>
      apiClient.put<Jemaat>(`/jemaat/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteJemaat() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/jemaat/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
