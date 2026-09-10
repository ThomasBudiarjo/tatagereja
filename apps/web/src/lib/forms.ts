import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { isApiClientError } from './api';

/**
 * Maps server-side validation issues onto form fields. Returns true when at least
 * one issue was attached to a field, so callers can skip a generic toast.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): boolean {
  if (!isApiClientError(error) || error.code !== 'VALIDATION') return false;
  let applied = false;
  for (const issue of error.issues) {
    const field = issue.path.split('.')[0] ?? '';
    if (fields.includes(field)) {
      setError(field as Path<T>, { type: 'server', message: issue.message });
      applied = true;
    }
  }
  return applied;
}
