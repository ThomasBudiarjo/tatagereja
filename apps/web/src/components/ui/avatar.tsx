import { initials } from '@tatagereja/shared';
import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

type EntityAvatarProps = {
  name: string;
  src?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string | null;
  square?: boolean;
};

const sizes = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
};

const palette = [
  'bg-orange-200 text-orange-900',
  'bg-amber-200 text-amber-900',
  'bg-emerald-200 text-emerald-900',
  'bg-sky-200 text-sky-900',
  'bg-violet-200 text-violet-900',
  'bg-rose-200 text-rose-900',
];

const colorFor = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length] ?? palette[0];
};

function EntityAvatar({
  name,
  src,
  className,
  size = 'md',
  color,
  square = false,
}: EntityAvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative flex shrink-0 overflow-hidden font-bold select-none',
        square ? 'rounded-xl' : 'rounded-full',
        sizes[size],
        className,
      )}
    >
      {src ? (
        <AvatarPrimitive.Image
          src={src}
          alt={name}
          className="aspect-square size-full object-cover"
        />
      ) : null}
      <AvatarPrimitive.Fallback
        delayMs={src ? 300 : 0}
        className={cn(
          'flex size-full items-center justify-center',
          color ? 'text-white' : colorFor(name),
        )}
        style={color ? { backgroundColor: color } : undefined}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export { EntityAvatar };
