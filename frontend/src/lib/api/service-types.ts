import {
  createQuery,
  createMutation,
  useQueryClient,
} from '@tanstack/svelte-query';
import { apiClient } from './client';
import type {
  CreateServiceTypeInput,
  Paginated,
  ServiceType,
} from '$lib/types';

const KEY = ['service-types'] as const;

export function serviceTypesListQuery() {
  return createQuery({
    queryKey: ['service-types', 'list'],
    queryFn: () => apiClient.get<Paginated<ServiceType>>('/service-types'),
  });
}

export function useCreateServiceType() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (data: CreateServiceTypeInput) =>
      apiClient.post<ServiceType>('/service-types', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateServiceType() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: ({ id, data }: { id: number; data: CreateServiceTypeInput }) =>
      apiClient.put<ServiceType>(`/service-types/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteServiceType() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/service-types/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
