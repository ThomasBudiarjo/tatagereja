import { apiClient, ApiError } from '$lib/api/client';
import { push } from 'svelte-spa-router';
import type { User } from '$lib/types';

class AuthStore {
  user = $state<User | null>(null);
  bootResolved = $state(false);

  get isAuthenticated(): boolean {
    return this.user !== null;
  }

  async login(email: string, password: string): Promise<void> {
    const res = await apiClient.post<{ user: User }>('/auth/login', { email, password });
    this.user = res.user;
    push('/');
  }

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout', {});
    } catch {
      /* ignore */
    }
    this.user = null;
    push('/login');
  }

  async restore(): Promise<void> {
    try {
      const me = await apiClient.get<{ user: User }>('/me');
      this.user = me.user;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) {
        console.error('auth.restore failed', e);
      }
      this.user = null;
    } finally {
      this.bootResolved = true;
    }
  }
}

export const auth = new AuthStore();
