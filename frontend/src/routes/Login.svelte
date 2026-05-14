<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { t } from '$lib/i18n';
  import { push } from 'svelte-spa-router';
  import { onMount } from 'svelte';

  let email = $state('');
  let password = $state('');

  onMount(() => {
    if (auth.isAuthenticated) {
      push('/');
    }
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    auth.login(email, password);
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-muted/30 p-4">
  <form
    class="w-full max-w-sm space-y-4 rounded-lg border bg-card p-8 shadow-sm"
    onsubmit={handleSubmit}
  >
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">Shepherd</h1>
      <p class="text-sm text-muted-foreground">
        {t('login.subtitle', 'Masuk ke akun gereja Anda.')}
      </p>
    </div>

    {#if auth.loginError}
      <p class="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {auth.loginError}
      </p>
    {/if}

    <div class="space-y-1.5">
      <Label for="email">{t('login.email', 'Email')}</Label>
      <Input
        id="email"
        type="email"
        required
        autocomplete="email"
        bind:value={email}
      />
    </div>

    <div class="space-y-1.5">
      <Label for="password">{t('login.password', 'Password')}</Label>
      <Input
        id="password"
        type="password"
        required
        autocomplete="current-password"
        bind:value={password}
      />
    </div>

    <Button type="submit" class="w-full" disabled={auth.isLoading}>
      {auth.isLoading ? t('login.loading', 'Masuk…') : t('login.submit', 'Masuk')}
    </Button>

    <p class="text-center text-xs text-muted-foreground">
      Hubungi admin untuk membuat akun gereja baru.
    </p>
  </form>
</div>
