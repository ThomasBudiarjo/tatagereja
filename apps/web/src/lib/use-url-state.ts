import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

type UrlValue = string | number | boolean | readonly string[];
export type UrlStateShape = Record<string, UrlValue>;

const parse = <T extends UrlValue>(raw: string[], fallback: T): T => {
  if (Array.isArray(fallback)) {
    const values = raw.flatMap((value) => value.split(',')).filter(Boolean);
    return (values.length ? values : fallback) as T;
  }
  const value = raw[0];
  if (value === undefined || value === '') return fallback;
  if (typeof fallback === 'number') {
    const number = Number(value);
    return (Number.isFinite(number) ? number : fallback) as T;
  }
  if (typeof fallback === 'boolean') return (value === '1' || value === 'true') as T;
  return value as T;
};

const same = (a: UrlValue, b: UrlValue) =>
  Array.isArray(a) && Array.isArray(b) ? a.join(',') === b.join(',') : a === b;

/**
 * List state (search, filters, sort, page, tab) kept in the URL search params, so reload,
 * deep links and back/forward keep it. Values equal to their default are left out of the URL.
 * Changing anything except `page` resets the page.
 *
 * ```ts
 * const [state, setState] = useUrlState({ q: '', status: '', sort: 'name', page: 1 });
 * setState({ status: 'member' });
 * ```
 */
export function useUrlState<T extends UrlStateShape>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const serialized = params.toString();
  // `defaults` is usually an inline object; its content is what matters.
  const defaultsKey = JSON.stringify(defaults);

  const state = useMemo(() => {
    const current = new URLSearchParams(serialized);
    const fallback = JSON.parse(defaultsKey) as T;
    const result = {} as Record<string, UrlValue>;
    for (const [key, value] of Object.entries(fallback)) {
      result[key] = parse(current.getAll(key), value);
    }
    return result as { [K in keyof T]: T[K] extends readonly string[] ? string[] : T[K] };
  }, [serialized, defaultsKey]);

  const setState = useCallback(
    (
      patch: Partial<{ [K in keyof T]: T[K] extends readonly string[] ? readonly string[] : T[K] }>,
      { push = false }: { push?: boolean } = {},
    ) => {
      const fallback = JSON.parse(defaultsKey) as T;
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          let resetPage = false;
          for (const [key, value] of Object.entries(patch) as [string, UrlValue | undefined][]) {
            if (key !== 'page') resetPage = true;
            next.delete(key);
            const base = fallback[key];
            if (value === undefined || (base !== undefined && same(value, base))) continue;
            if (Array.isArray(value)) {
              if (value.length) next.set(key, value.join(','));
            } else if (typeof value === 'boolean') {
              next.set(key, value ? '1' : '0');
            } else if (value !== '') {
              next.set(key, String(value));
            }
          }
          if (resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: !push, preventScrollReset: true },
      );
    },
    [defaultsKey, setParams],
  );

  /** Restores every key to its default (clears filters). */
  const reset = useCallback(
    (keep: (keyof T)[] = []) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const key of Object.keys(JSON.parse(defaultsKey) as T)) {
            if (!keep.includes(key)) next.delete(key);
          }
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [defaultsKey, setParams],
  );

  return [state, setState, reset] as const;
}
