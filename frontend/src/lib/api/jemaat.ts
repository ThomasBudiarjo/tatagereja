import { apiClient } from '$lib/api/client';
import type { Jemaat, Paginated } from '$lib/types';

export type JemaatWrite = {
  nama_lengkap: string;
  nama_panggilan?: string | null;
  jenis_kelamin?: 'L' | 'P' | null;
  tanggal_lahir?: string | null;
  tempat_lahir?: string | null;
  alamat?: string | null;
  nomor_telepon?: string | null;
  email?: string | null;
  status_pernikahan?: string | null;
  tanggal_baptis?: string | null;
  tanggal_sidi?: string | null;
  keluarga_id?: number | null;
  catatan?: string | null;
};

export const jemaatApi = {
  list: (params: { q?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    const suffix = qs.toString();
    return apiClient.get<Paginated<Jemaat>>(`/jemaat${suffix ? '?' + suffix : ''}`);
  },
  get: (id: number) => apiClient.get<Jemaat>(`/jemaat/${id}`),
  create: (body: JemaatWrite) => apiClient.post<Jemaat>('/jemaat', body),
  update: (id: number, body: JemaatWrite) => apiClient.put<Jemaat>(`/jemaat/${id}`, body),
  remove: (id: number) => apiClient.delete<void>(`/jemaat/${id}`),
};
