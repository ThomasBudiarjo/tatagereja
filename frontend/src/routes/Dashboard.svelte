<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
</script>

<div class="container mx-auto p-6">
  <header class="mb-6 flex items-center justify-between">
    <h1 class="text-2xl font-semibold">Dashboard</h1>
    <button
      class="rounded-md bg-gray-200 px-4 py-2 text-sm hover:bg-gray-300"
      onclick={() => auth.logout()}
    >
      Keluar
    </button>
  </header>

  {#if auth.user}
    <p class="text-gray-600">Selamat datang, {auth.user.display_name}.</p>
  {/if}

  <div class="mt-6 grid gap-4 sm:grid-cols-2">
    <a href="#/jemaat" class="rounded-lg border p-6 hover:shadow-md">
      <h2 class="text-lg font-medium">Jemaat</h2>
      <p class="text-sm text-gray-500">Kelola data anggota jemaat</p>
    </a>
  </div>
</div>
