<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';

  let email = $state('');
  let password = $state('');
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
  <form
    class="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow-md"
    onsubmit={(e) => {
      e.preventDefault();
      auth.login(email, password);
    }}
  >
    <h1 class="text-2xl font-semibold">Shepherd</h1>
    <p class="text-sm text-gray-500">Masuk ke akun gereja Anda.</p>

    <div>
      <label for="email" class="block text-sm font-medium text-gray-700">Email</label>
      <input
        id="email"
        type="email"
        bind:value={email}
        required
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>

    <div>
      <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
      <input
        id="password"
        type="password"
        bind:value={password}
        required
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>

    <button
      type="submit"
      disabled={auth.isLoading}
      class="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {auth.isLoading ? 'Masuk...' : 'Masuk'}
    </button>
  </form>
</div>
