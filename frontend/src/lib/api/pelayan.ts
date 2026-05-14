import {
  createQuery,
  createMutation,
  useQueryClient,
} from '@tanstack/svelte-query';
import { apiClient } from './client';
import type {
  CreatePelayanInput,
  Paginated,
  Pelayan,
  UpdatePelayanInput,
} from '$lib/types';

const KEY = ['pelayan'] as const;

export interface PelayanListParams {
  limit?: number;
  offset?: number;
  q?: string;
}

export function pelayanListQuery(params: () => PelayanListParams) {
  return createQuery({
    queryKey: ['pelayan', 'list', params()],
    queryFn: () => {
      const p = params();
      const search = new URLSearchParams();
      if (p.limit !== undefined) search.set('limit', String(p.limit));
      if (p.offset !== undefined) search.set('offset', String(p.offset));
      if (p.q && p.q.trim() !== '') search.set('q', p.q.trim());
      const qs = search.toString();
      return apiClient.get<Paginated<Pelayan>>(`/pelayan${qs ? `?${qs}` : ''}`);
    },
  });
}

export function pelayanDetailQuery(id: () => number | null) {
  return createQuery({
    queryKey: ['pelayan', 'detail', id()],
    enabled: id() !== null,
    queryFn: () => apiClient.get<Pelayan>(`/pelayan/${id()}`),
  });
}

export function useCreatePelayan() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (data: CreatePelayanInput) => apiClient.post<Pelayan>('/pelayan', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdatePelayan() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePelayanInput }) =>
      apiClient.put<Pelayan>(`/pelayan/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeletePelayan() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/pelayan/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
