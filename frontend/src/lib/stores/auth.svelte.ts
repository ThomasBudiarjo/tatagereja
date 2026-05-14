import { apiClient, ApiError } from '$lib/api/client';
import type { User } from '$lib/types';
import { push } from 'svelte-spa-router';

class AuthStore {
  user = $state<User | null>(null);
  isLoading = $state(false);
  loginError = $state<string | null>(null);
  restored = $state(false);

  get isAuthenticated() {
    return this.user !== null;
  }

  async login(email: string, password: string) {
    this.isLoading = true;
    this.loginError = null;
    try {
      const res = await apiClient.post<{ user: User }>('/auth/login', { email, password });
      this.user = res.user;
      push('/');
    } catch (err) {
      if (err instanceof ApiError) {
        this.loginError = err.message;
      } else {
        this.loginError = 'Unable to login';
      }
    } finally {
      this.isLoading = false;
    }
  }

  async logout() {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // ignore — clear state anyway
    }
    this.user = null;
    push('/login');
  }

  async restore() {
    try {
      const res = await apiClient.get<User>('/me');
      this.user = res;
    } catch {
      this.user = null;
    } finally {
      this.restored = true;
    }
  }
}

export const auth = new AuthStore();
