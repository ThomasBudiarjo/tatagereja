import type { QueryClient, QueryKey, UseMutationResult } from '@tanstack/react-query';
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { getErrorMessage, isApiClientError } from './api';
import { applyServerErrors } from './forms';
import { t } from './i18n';

type Message<TData, TVariables> = string | ((data: TData, variables: TVariables) => string);

export type MutationToastOptions<TData, TVariables, TForm extends FieldValues> = {
  /** Toast after success; false for none. */
  success?: Message<TData, TVariables> | false;
  /** Replaces the API message in the error toast. */
  error?: string | ((error: unknown) => string);
  /** Maps `422` issues onto these form fields (defaults to the form's own fields). */
  form?: Pick<UseFormReturn<TForm>, 'setError' | 'getValues'>;
  fields?: readonly string[];
  /** Show unmapped errors on the form (`errors.root`) instead of a toast. */
  rootError?: boolean;
};

/**
 * Runs a mutation the standard way: ignores a second submit while one is pending, shows a
 * success toast, maps `422` issues to form fields and shows the API message otherwise.
 * `run` resolves with the data, or `undefined` when it failed (already reported).
 *
 * ```ts
 * const save = useMutationToast(useUpdateFund(churchId), {
 *   success: t('finance.fundSaved'),
 *   form,
 * });
 * const onSubmit = form.handleSubmit((values) => save.run(values));
 * <Button type="submit" loading={save.isPending}>...</Button>
 * ```
 * Invalidate every affected query in the mutation's own `onSuccess`.
 */
export function useMutationToast<TData, TVariables, TForm extends FieldValues = FieldValues>(
  mutation: UseMutationResult<TData, unknown, TVariables, unknown>,
  options: MutationToastOptions<TData, TVariables, TForm> = {},
) {
  const running = useRef(false);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });
  const { mutateAsync } = mutation;

  const run = useCallback(
    async (variables: TVariables): Promise<TData | undefined> => {
      if (running.current) return undefined;
      running.current = true;
      const { success, error: errorMessage, form, fields, rootError } = optionsRef.current;
      try {
        const data = await mutateAsync(variables);
        if (success)
          toast.success(typeof success === 'function' ? success(data, variables) : success);
        return data;
      } catch (error) {
        if (form) {
          const names = fields ?? Object.keys(form.getValues() as Record<string, unknown>);
          if (applyServerErrors(error, form.setError, names)) {
            toast.error(t('common.fixErrors'));
            return undefined;
          }
        }
        const message =
          typeof errorMessage === 'function'
            ? errorMessage(error)
            : (errorMessage ?? getErrorMessage(error));
        if (rootError && form) form.setError('root', { type: 'server', message });
        else toast.error(message);
        return undefined;
      } finally {
        running.current = false;
      }
    },
    [mutateAsync],
  );

  return { run, isPending: mutation.isPending };
}

/**
 * Optimistic update helper for `onMutate`: cancels in-flight fetches, applies `update` to the
 * cached value and returns a function that restores the previous value (call it in `onError`).
 *
 * ```ts
 * onMutate: (status) => optimistic(client, keys.event(churchId, id), (old) => old && { ...old, myStatus: status }),
 * onError: (_error, _vars, rollback) => rollback?.(),
 * onSettled: () => client.invalidateQueries({ queryKey: keys.events(churchId) }),
 * ```
 */
export async function optimistic<T>(
  client: QueryClient,
  queryKey: QueryKey,
  update: (old: T | undefined) => T | undefined,
): Promise<() => void> {
  await client.cancelQueries({ queryKey });
  const previous = client.getQueryData<T>(queryKey);
  client.setQueryData<T>(queryKey, update);
  return () => client.setQueryData<T>(queryKey, previous);
}

/** Invalidates several query keys at once (lists, details, counts and the dashboard). */
export const invalidateAll = (client: QueryClient, queryKeys: readonly QueryKey[]) =>
  Promise.all(queryKeys.map((queryKey) => client.invalidateQueries({ queryKey })));

/** Whether an error means the item is gone (deleted elsewhere), so the screen can move away. */
export const isGone = (error: unknown) => isApiClientError(error) && error.status === 404;
