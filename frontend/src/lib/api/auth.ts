import { apiClient } from '$lib/api/client';
import type { User } from '$lib/types';

export const authApi = {
  me: () => apiClient.get<{ user: User }>('/me'),
};
