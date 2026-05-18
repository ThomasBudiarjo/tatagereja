<script lang="ts">
  let {
    name,
    size = 'md',
  }: {
    name: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
  } = $props();

  const initials = $derived(
    (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join('')
      .toUpperCase(),
  );

  const paletteCls = $derived.by(() => {
    const palette = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) | 0;
    }
    return palette[Math.abs(hash) % palette.length];
  });

  const sizeCls = $derived(
    size === 'lg' ? 'avatar-lg' : size === 'sm' ? 'avatar-sm' : size === 'xs' ? 'avatar-xs' : '',
  );
</script>

<div class="avatar {sizeCls} {paletteCls}">{initials}</div>
