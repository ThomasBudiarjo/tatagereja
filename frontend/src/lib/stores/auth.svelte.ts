import { apiClient } from '$lib/api/client';
import { push } from 'svelte-spa-router';

type User = {
  id: number;
  email: string;
  display_name: string;
  role: 'admin' | 'editor' | 'viewer';
  church_id: number;
};

class AuthStore {
  user = $state<User | null>(null);
  isLoading = $state(false);

  get isAuthenticated() {
    return this.user !== null;
  }

  async login(email: string, password: string) {
    this.isLoading = true;
    try {
      const res = await apiClient.post<{ user: User }>('/api/auth/login', { email, password });
      this.user = res.user;
      push('/');
    } finally {
      this.isLoading = false;
    }
  }

  async logout() {
    await apiClient.post('/api/auth/logout', {});
    this.user = null;
    push('/login');
  }

  async restore() {
    try {
      const res = await apiClient.get<User>('/api/me');
      this.user = res;
    } catch {
      this.user = null;
    }
  }
}

export const auth = new AuthStore();
