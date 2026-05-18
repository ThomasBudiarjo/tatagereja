<script lang="ts">
  import { push } from 'svelte-spa-router';
  import Icon from '$lib/components/Icon.svelte';
</script>

<div class="app">
  <div class="app-scroll">
    <div class="empty" style="margin-top: 80px;">
      <div class="empty-icon"><Icon name="help" /></div>
      <div class="empty-title">Halaman tidak ditemukan</div>
      <div class="empty-sub">Coba kembali ke beranda.</div>
      <button class="btn btn-primary" type="button" style="margin-top: 16px;" onclick={() => push('/')}>
        Ke beranda
      </button>
    </div>
  </div>
</div>
