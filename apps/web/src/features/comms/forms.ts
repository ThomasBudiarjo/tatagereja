import { useCallback } from 'react';
import type { FieldValues, Resolver, UseFormReturn } from 'react-hook-form';
import { useI18n, type MessageKey } from '@/lib/i18n';

/**
 * The comms rules written in English in the shared schemas and the API (field issues of a
 * 422), by their dictionary key; zod's own messages already follow the interface language.
 */
const RULE_MESSAGES: Record<string, MessageKey> = {
  'Choose the group': 'comms.ruleGroup',
  'Choose at least one role': 'comms.ruleRoles',
  'Expiry must be after the publish time': 'comms.ruleExpiry',
  'End time must be after the start time': 'comms.ruleEndAfterStart',
  'The end date must be on or after the first occurrence': 'comms.ruleUntilAfterStart',
  'A series can run for at most two years': 'comms.ruleSeriesLength',
};

function useRuleMessage() {
  const { t } = useI18n();
  return useCallback(
    (message: string) => {
      const key = RULE_MESSAGES[message];
      return key ? t(key) : message;
    },
    [t],
  );
}

/** Wraps a form resolver so the comms rules show in the interface language. */
export function useCommsResolver<TInput extends FieldValues, TContext, TOutput>(
  resolver: Resolver<TInput, TContext, TOutput>,
): Resolver<TInput, TContext, TOutput> {
  const translate = useRuleMessage();
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'ref') continue;
      if (key === 'message' && typeof value === 'string') {
        (node as { message: string }).message = translate(value);
      } else walk(value);
    }
  };
  return async (values, context, options) => {
    const result = await resolver(values, context, options);
    walk(result.errors);
    return result;
  };
}

/** The form as `useMutationToast` maps 422 issues onto it, translating rule messages. */
export function useServerErrors<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, 'setError' | 'getValues'>,
): Pick<UseFormReturn<T>, 'setError' | 'getValues'> {
  const translate = useRuleMessage();
  return {
    getValues: form.getValues,
    setError: (name, error, options) =>
      form.setError(
        name,
        { ...error, message: error.message ? translate(error.message) : error.message },
        options,
      ),
  };
}
