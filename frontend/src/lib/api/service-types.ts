import { apiClient } from '$lib/api/client';
import type { ListWrap, ServiceType } from '$lib/types';

export type ServiceTypeWrite = {
  nama: string;
  deskripsi?: string | null;
  urutan?: number;
};

export const serviceTypesApi = {
  list: () => apiClient.get<ListWrap<ServiceType>>('/service-types'),
  create: (body: ServiceTypeWrite) => apiClient.post<ServiceType>('/service-types', body),
  update: (id: number, body: ServiceTypeWrite) =>
    apiClient.put<ServiceType>(`/service-types/${id}`, body),
  remove: (id: number) => apiClient.delete<void>(`/service-types/${id}`),
};
