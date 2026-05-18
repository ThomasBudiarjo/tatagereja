import { apiClient } from '$lib/api/client';
import type { Jemaat, Keluarga, Paginated } from '$lib/types';

export type KeluargaWrite = {
  nama_keluarga: string;
  alamat?: string | null;
  catatan?: string | null;
};

export type KeluargaDetail = {
  keluarga: Keluarga;
  members: Jemaat[];
};

export const keluargaApi = {
  list: (params: { limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    const suffix = qs.toString();
    return apiClient.get<Paginated<Keluarga>>(`/keluarga${suffix ? '?' + suffix : ''}`);
  },
  get: (id: number) => apiClient.get<KeluargaDetail>(`/keluarga/${id}`),
  create: (body: KeluargaWrite) => apiClient.post<Keluarga>('/keluarga', body),
  update: (id: number, body: KeluargaWrite) => apiClient.put<Keluarga>(`/keluarga/${id}`, body),
  remove: (id: number) => apiClient.delete<void>(`/keluarga/${id}`),
};
