import { apiClient } from '$lib/api/client';
import type { JadwalSlot, Kebaktian, ListWrap, Paginated } from '$lib/types';

export type KebaktianWrite = {
  nama: string;
  waktu_mulai: string;
  lokasi?: string | null;
  tema?: string | null;
  pengkhotbah?: string | null;
  catatan?: string | null;
};

export type JadwalSlotWrite = {
  service_type_id: number;
  pelayan_id: number | null;
  catatan?: string | null;
};

export const kebaktianApi = {
  list: (params: { limit?: number; offset?: number; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const suffix = qs.toString();
    return apiClient.get<Paginated<Kebaktian> | ListWrap<Kebaktian>>(
      `/kebaktian${suffix ? '?' + suffix : ''}`,
    );
  },
  get: (id: number) => apiClient.get<Kebaktian>(`/kebaktian/${id}`),
  create: (body: KebaktianWrite) => apiClient.post<Kebaktian>('/kebaktian', body),
  update: (id: number, body: KebaktianWrite) =>
    apiClient.put<Kebaktian>(`/kebaktian/${id}`, body),
  remove: (id: number) => apiClient.delete<void>(`/kebaktian/${id}`),
  getJadwal: (id: number) => apiClient.get<ListWrap<JadwalSlot>>(`/kebaktian/${id}/jadwal`),
  replaceJadwal: (id: number, slots: JadwalSlotWrite[]) =>
    apiClient.put<void>(`/kebaktian/${id}/jadwal`, { slots }),
};
