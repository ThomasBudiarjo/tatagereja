<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { ApiError } from '$lib/api/client';
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import Field from '$lib/components/Field.svelte';

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

<div class="app" style="background: var(--bg);">
  <div class="app-scroll" style="display: flex; flex-direction: column;">
    <div style="padding: 64px 24px 24px; flex: 1; display: flex; flex-direction: column;">
      <div
        style="width: 56px; height: 56px; border-radius: 18px; background: var(--accent);
               color: #fff; display: flex; align-items: center; justify-content: center;
               font-weight: 800; font-size: 22px; letter-spacing: -0.02em; margin-bottom: 28px;"
      >
        tg
      </div>
      <h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.025em; color: var(--ink);">
        Tata Gereja
      </h1>
      <p style="margin: 6px 0 32px; color: var(--ink-3); font-size: 15px;">
        Masuk untuk mengelola jemaat &amp; pelayanan
      </p>

      <form onsubmit={submit} style="display: flex; flex-direction: column; gap: 16px;">
        <Field label="Email" required>
          <input
            class="input"
            type="email"
            inputmode="email"
            autocomplete="email"
            bind:value={email}
            required
          />
        </Field>
        <Field label="Password" required>
          <input
            class="input"
            type="password"
            autocomplete="current-password"
            bind:value={password}
            required
          />
        </Field>
        {#if error}
          <p class="field-error" style="margin: -4px 0 0;">{error}</p>
        {/if}
        <button class="btn btn-primary btn-block" type="submit" disabled={submitting} style="margin-top: 8px;">
          {submitting ? 'Memuat…' : 'Masuk'}
        </button>
      </form>

      <div class="spacer" style="flex: 1; min-height: 24px;"></div>

      <div
        style="background: var(--surface-2); border-radius: 14px; padding: 14px;
               font-size: 12px; color: var(--ink-3); line-height: 1.55; margin-top: 32px;"
      >
        <div style="font-weight: 700; color: var(--ink-2); margin-bottom: 2px;">
          Proyek hobi open-source
        </div>
        Tidak ada SLA. Akun dibuat manual oleh pemilik instansi melalui
        <span class="mono">seed-admin</span>.
      </div>
    </div>
  </div>
</div>
