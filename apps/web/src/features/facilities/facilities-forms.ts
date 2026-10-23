import { useCallback } from 'react';
import type { FieldValues, Resolver, UseFormReturn } from 'react-hook-form';
import { useI18n, type MessageKey } from '@/lib/i18n';

/**
 * The facilities rules written in English in the shared schemas and the API (field issues of a
 * 422), by their dictionary key; zod's own messages already follow the interface language.
 */
const RULE_MESSAGES: Record<string, MessageKey> = {
  'A booking can last at most one week': 'facilities.ruleBookingLength',
  'A weekly booking can repeat for at most two years': 'facilities.ruleRecurrenceLength',
  'Choose a start time in the future': 'facilities.ruleFutureStart',
  'Choose when the weekly booking ends': 'facilities.ruleRecurrenceUntil',
  'Choose who borrows it': 'facilities.ruleBorrower',
  'End time must be after the start time': 'facilities.ruleEndAfterStart',
  'The due date cannot be in the past': 'facilities.ruleDueDatePast',
  'The next service date must be after this one': 'facilities.ruleNextService',
};

/** Translates a known rule message; anything else is shown as it came. */
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

/** Wraps a form resolver so the facilities rules show in the interface language. */
export function useFacilitiesResolver<TInput extends FieldValues, TContext, TOutput>(
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

/**
 * The form as `useMutationToast` maps 422 issues onto it, translating the API's rule messages
 * on the way.
 */
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
