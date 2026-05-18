<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { ApiError } from '$lib/api/client';
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let submitting = $state(false);

  onMount(() => {
    if (auth.isAuthenticated) push('/');
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    submitting = true;
    try {
      await auth.login(email, password);
    } catch (e) {
      if (e instanceof ApiError) {
        error = e.status === 401 ? 'Email atau password salah' : e.message;
      } else {
        error = 'Tidak dapat tersambung ke server';
      }
    } finally {
      submitting = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-secondary/40 p-4">
  <div class="card w-full max-w-sm p-6">
    <div class="mb-6 text-center">
      <h1 class="text-2xl font-bold">Tata Gereja</h1>
      <p class="text-sm text-muted-foreground">Masuk untuk melanjutkan</p>
    </div>
    <form onsubmit={submit} class="space-y-4">
      <div class="field">
        <label class="label" for="email">Email</label>
        <input
          id="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          required
          class="input"
          bind:value={email}
        />
      </div>
      <div class="field">
        <label class="label" for="password">Password</label>
        <input
          id="password"
          type="password"
          autocomplete="current-password"
          required
          class="input"
          bind:value={password}
        />
      </div>
      {#if error}
        <p class="text-sm text-destructive">{error}</p>
      {/if}
      <button type="submit" class="btn-primary w-full" disabled={submitting}>
        {submitting ? 'Memuat…' : 'Masuk'}
      </button>
    </form>
    <p class="mt-6 text-xs text-muted-foreground">
      Hubungi pengelola gereja untuk dibuatkan akun.
    </p>
  </div>
</div>
