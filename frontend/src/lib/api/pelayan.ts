import { apiClient } from '$lib/api/client';
import type { Paginated, Pelayan, ServiceType } from '$lib/types';

export type PelayanCreate = {
  jemaat_id: number;
  catatan?: string | null;
  service_type_ids?: number[];
};

export type PelayanUpdate = {
  catatan?: string | null;
  service_type_ids?: number[];
};

export type PelayanDetail = {
  pelayan: {
    id: number;
    user_id: number;
    jemaat_id: number;
    catatan: string | null;
  };
  service_types: ServiceType[];
};

export const pelayanApi = {
  list: (params: { limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    const suffix = qs.toString();
    return apiClient.get<Paginated<Pelayan>>(`/pelayan${suffix ? '?' + suffix : ''}`);
  },
  get: (id: number) => apiClient.get<PelayanDetail>(`/pelayan/${id}`),
  create: (body: PelayanCreate) => apiClient.post<{ id: number }>('/pelayan', body),
  update: (id: number, body: PelayanUpdate) =>
    apiClient.put<{ id: number }>(`/pelayan/${id}`, body),
  remove: (id: number) => apiClient.delete<void>(`/pelayan/${id}`),
};
