<script lang="ts">
  import { cn } from '$lib/utils/cn';

  interface Props {
    name?: string;
    id?: string;
    placeholder?: string;
    value?: string | null;
    required?: boolean;
    disabled?: boolean;
    rows?: number;
    class?: string;
  }

  let {
    name,
    id,
    placeholder,
    value = $bindable(''),
    required = false,
    disabled = false,
    rows = 3,
    class: className = '',
  }: Props = $props();

  const cls = cn(
    'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
    className,
  );
</script>

<textarea
  {name}
  {id}
  {placeholder}
  {required}
  {disabled}
  {rows}
  bind:value
  class={cls}
></textarea>
