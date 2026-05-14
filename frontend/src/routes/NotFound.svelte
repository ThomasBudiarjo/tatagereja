<script lang="ts">
  import { t } from '$lib/i18n';
</script>

<div class="flex min-h-screen flex-col items-center justify-center p-6 text-center">
  <h1 class="text-4xl font-semibold">404</h1>
  <p class="mt-2 text-sm text-muted-foreground">
    {t('not_found.message', 'Halaman tidak ditemukan.')}
  </p>
  <a href="#/" class="mt-4 inline-block text-sm text-primary hover:underline">
    ← {t('not_found.back', 'Kembali ke Dashboard')}
  </a>
</div>
