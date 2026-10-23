import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/*
 * A small virtualizer for long lists that scroll with the page (a whole roster, a long
 * inbox). Only the rows near the screen are mounted; the rest is empty space of the right
 * height, so a phone renders sixty rows instead of eight thousand. Rows may differ in height:
 * each mounted row is measured, others use the estimate until they have been seen.
 *
 * ```tsx
 * const { attachList, rows, paddingTop, paddingBottom, measure } = useWindowVirtualizer({
 *   count: people.length,
 *   estimateSize: 64,
 *   getKey: (index) => people[index].id,
 * });
 * <ul ref={attachList} style={{ paddingTop, paddingBottom }}>
 *   {rows.map((index) => <li key={people[index].id} ref={measure(index)}>...</li>)}
 * </ul>
 * ```
 *
 * Below `threshold` rows every row is rendered (no layout change for short lists).
 */

type Options = {
  count: number;
  /** Height in px of a row not measured yet. */
  estimateSize: number;
  /** Identity of a row, so measurements survive filtering and reordering. */
  getKey: (index: number) => string;
  /** Rows rendered above and below the screen (smooth fast scrolling, arrow-key focus). */
  overscan?: number;
  threshold?: number;
};

export function useWindowVirtualizer({
  count,
  estimateSize,
  getKey,
  overscan = 10,
  threshold = 80,
}: Options) {
  const enabled = count > threshold;
  const list = useRef<HTMLElement | null>(null);
  /** Ref callback for the list element (its top is where row 0 starts). */
  const attachList = useCallback((element: HTMLElement | null) => {
    list.current = element;
  }, []);
  const [sizes, setSizes] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 40) });

  const keys = useMemo(
    () => Array.from({ length: count }, (_, index) => getKey(index)),
    [count, getKey],
  );
  // offsets[i] is the top of row i inside the list; offsets[count] the full height.
  const offsets = useMemo(() => {
    const result = new Float64Array(count + 1);
    for (let index = 0; index < count; index += 1) {
      result[index + 1] = result[index]! + (sizes.get(keys[index]!) ?? estimateSize);
    }
    return result;
  }, [keys, estimateSize, sizes, count]);

  const update = useCallback(() => {
    if (!list.current || !enabled) return;
    const top = list.current.getBoundingClientRect().top;
    const from = Math.max(0, -top);
    const to = from + window.innerHeight;
    const find = (y: number) => {
      let low = 0;
      let high = count;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (offsets[middle + 1]! <= y) low = middle + 1;
        else high = middle;
      }
      return low;
    };
    const start = Math.max(0, find(from) - overscan);
    const end = Math.min(count, find(to) + 1 + overscan);
    setRange((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, [enabled, count, offsets, overscan]);

  useLayoutEffect(() => {
    update();
  }, [update]);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [enabled, update]);

  // One observer for every mounted row; a changed height re-lays out the rows below it.
  // Created with the first render, because rows attach (ref callbacks) before effects run.
  const [keyOf] = useState(() => new WeakMap<Element, string>());
  const [observer] = useState(() => {
    if (typeof ResizeObserver === 'undefined') return null;
    let frame = 0;
    const heights = new Map<string, number>();
    return new ResizeObserver((entries) => {
      for (const entry of entries) {
        const key = keyOf.get(entry.target);
        const height = (entry.target as HTMLElement).offsetHeight;
        if (key && height > 0) heights.set(key, height);
      }
      if (heights.size === 0 || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const batch = new Map(heights);
        heights.clear();
        setSizes((current) =>
          [...batch].every(([key, height]) => current.get(key) === height)
            ? current
            : new Map([...current, ...batch]),
        );
      });
    });
  });
  useEffect(() => () => observer?.disconnect(), [observer]);

  const measure = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      if (!element || !enabled || !observer) return;
      keyOf.set(element, keys[index]!);
      observer.observe(element);
      return () => observer.unobserve(element);
    },
    [enabled, keys, keyOf, observer],
  );

  /** Brings a row that may not be mounted into view (keyboard navigation). */
  const scrollToIndex = useCallback(
    (index: number) => {
      if (!list.current || !enabled) return;
      const top = list.current.getBoundingClientRect().top + window.scrollY + (offsets[index] ?? 0);
      window.scrollTo({ top: top - window.innerHeight / 3 });
      // Mount the row with this event's render: the scroll's own update comes a frame later,
      // after the caller wants to focus the row (arrow keys, marking row after row).
      setRange((current) =>
        index >= current.start && index < current.end
          ? current
          : { start: Math.max(0, index - overscan), end: Math.min(count, index + overscan + 1) },
      );
    },
    [enabled, offsets, overscan, count],
  );

  if (!enabled) {
    return {
      attachList,
      rows: keys.map((_, index) => index),
      paddingTop: 0,
      paddingBottom: 0,
      measure,
      scrollToIndex,
      isMounted: () => true,
    };
  }
  const start = Math.min(range.start, count);
  const end = Math.min(Math.max(range.end, start), count);
  return {
    attachList,
    rows: Array.from({ length: end - start }, (_, offset) => start + offset),
    paddingTop: offsets[start] ?? 0,
    paddingBottom: (offsets[count] ?? 0) - (offsets[end] ?? 0),
    measure,
    scrollToIndex,
    isMounted: (index: number) => index >= start && index < end,
  };
}
