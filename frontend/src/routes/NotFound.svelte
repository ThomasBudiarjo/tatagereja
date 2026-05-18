<script lang="ts">
  import { link } from 'svelte-spa-router';
</script>

<div class="flex min-h-screen items-center justify-center p-4">
  <div class="text-center">
    <h1 class="text-3xl font-bold">404</h1>
    <p class="text-muted-foreground">Halaman tidak ditemukan.</p>
    <a href="/" use:link class="btn-primary mt-4 inline-block">Kembali</a>
  </div>
</div>
