import { Tabs as TabsPrimitive } from 'radix-ui';
import * as React from 'react';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

type Variant = 'pill' | 'underline';
const VariantContext = React.createContext<Variant>('pill');

function TabsList({
  className,
  variant = 'pill',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: Variant }) {
  return (
    <VariantContext.Provider value={variant}>
      <TabsPrimitive.List
        className={cn(
          'scrollbar-none overflow-x-auto',
          variant === 'pill'
            ? 'inline-flex h-11 w-full items-center justify-start rounded-xl bg-muted p-1 text-muted-foreground sm:justify-center'
            : '-mx-4 flex h-11 items-end gap-1 border-b px-4 sm:mx-0 sm:px-0',
          className,
        )}
        {...props}
      />
    </VariantContext.Provider>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(VariantContext);
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
        variant === 'pill'
          ? 'h-full flex-1 rounded-lg px-3 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs'
          : 'relative h-full rounded-t-md px-3 text-muted-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors hover:text-foreground data-[state=active]:text-foreground data-[state=active]:after:bg-primary',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        'mt-4 outline-none data-[state=active]:animate-in data-[state=active]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Tabs whose selection lives in the URL (`?tab=members`), so reload, deep links and the back
 * button keep it. Unknown values fall back to `defaultValue`.
 */
function UrlTabs({
  param = 'tab',
  defaultValue,
  values,
  ...props
}: Omit<
  React.ComponentProps<typeof TabsPrimitive.Root>,
  'value' | 'onValueChange' | 'defaultValue'
> & {
  param?: string;
  defaultValue: string;
  /** The tabs that exist (and that the caller may see). */
  values: readonly string[];
}) {
  const [state, setState] = useUrlState({ [param]: defaultValue });
  const raw = String(state[param] ?? defaultValue);
  const value = values.includes(raw) ? raw : defaultValue;
  return (
    <Tabs
      value={value}
      onValueChange={(next) => setState({ [param]: next }, { push: true })}
      {...props}
    />
  );
}

export { Tabs, UrlTabs, TabsList, TabsTrigger, TabsContent };
