import { initials } from '@tatagereja/shared';
import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { toneFor } from './tone';

type EntityAvatarProps = {
  name: string;
  src?: string | null;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: string | null;
  square?: boolean;
};

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
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
        data-tone={color ? undefined : toneFor(name)}
        className={cn(
          'flex size-full items-center justify-center',
          color ? 'text-white' : 'bg-tone-soft text-tone-ink',
        )}
        style={color ? { backgroundColor: color } : undefined}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

/** Overlapping avatars with a "+N" for the rest (serving team, group leaders). */
function AvatarGroup({
  people,
  max = 4,
  size = 'sm',
  className,
}: {
  people: { id?: string; name: string; src?: string | null }[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {shown.map((person, index) => (
        <EntityAvatar
          key={person.id ?? `${person.name}-${index}`}
          name={person.name}
          src={person.src}
          size={size}
          className="ring-2 ring-card"
        />
      ))}
      {rest > 0 ? (
        <span
          className={cn(
            'relative flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card',
            sizes[size],
          )}
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

export { EntityAvatar, AvatarGroup };
